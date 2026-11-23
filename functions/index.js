"use strict";

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {logger} = require("firebase-functions");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getMessaging} = require("firebase-admin/messaging");

initializeApp();

const db = getFirestore();
const ZONE = "Europe/Paris";
const BASE_URL = "https://emmacaulinech-lab.github.io";

function maintenantParis() {
  const parties = new Intl.DateTimeFormat("fr-FR", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const valeur = Object.fromEntries(parties.map((partie) => [partie.type, partie.value]));
  return {
    date: `${valeur.year}-${valeur.month}-${valeur.day}`,
    minute: Number(valeur.hour) * 60 + Number(valeur.minute),
  };
}

function heureEnMinutes(heure) {
  const correspondance = String(heure || "").match(/^(\d{2}):(\d{2})$/);
  if (!correspondance) return null;
  return Number(correspondance[1]) * 60 + Number(correspondance[2]);
}

function urlComplete(chemin) {
  if (/^https:\/\//.test(String(chemin || ""))) return chemin;
  const propre = String(chemin || "/emma/");
  return BASE_URL + (propre.startsWith("/") ? propre : `/${propre}`);
}

async function reserverNotification(reference) {
  return db.runTransaction(async (transaction) => {
    const instantane = await transaction.get(reference);
    if (!instantane.exists) return null;
    const notification = instantane.data();
    const reservationEnCours = notification.envoiEnCoursAt?.toMillis?.();
    const reservationRecente = reservationEnCours && Date.now() - reservationEnCours < 5 * 60 * 1000;
    if (notification.envoyeeAt || reservationRecente || notification.faite === true) return null;
    transaction.update(reference, {envoiEnCoursAt: FieldValue.serverTimestamp()});
    return notification;
  });
}

async function envoyerNotification(reference) {
  const notification = await reserverNotification(reference);
  if (!notification) return {statut: "ignoree"};

  const tokenDocument = await db.collection("emma_push_tokens").doc(notification.userId).get();
  const token = tokenDocument.data()?.token;
  if (!token) {
    await reference.update({
      envoiEnCoursAt: FieldValue.delete(),
      erreurEnvoi: "Aucun appareil abonné aux notifications",
      erreurEnvoiAt: FieldValue.serverTimestamp(),
    });
    return {statut: "sans_token"};
  }

  const url = urlComplete(notification.url);
  try {
    const messageId = await getMessaging().send({
      token,
      data: {
        title: String(notification.titre || "EMMA ✨"),
        message: String(notification.message || notification.texte || "Tu as une nouvelle notification"),
        url,
        module: String(notification.categorie || "journal"),
        type: String(notification.typeNotification || "tache"),
        id: String(notification.planningId || reference.id),
      },
      webpush: {
        headers: {Urgency: "high"},
        fcmOptions: {link: url},
      },
    });

    await reference.update({
      envoyeeAt: FieldValue.serverTimestamp(),
      envoiEnCoursAt: FieldValue.delete(),
      erreurEnvoi: FieldValue.delete(),
      messageId,
    });
    return {statut: "envoyee"};
  } catch (erreur) {
    const code = String(erreur?.code || "");
    await reference.update({
      envoiEnCoursAt: FieldValue.delete(),
      erreurEnvoi: String(erreur?.message || erreur),
      erreurEnvoiAt: FieldValue.serverTimestamp(),
    });
    if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
      await tokenDocument.ref.delete();
    }
    logger.error("Envoi notification EMMA impossible", {id: reference.id, code, erreur: erreur?.message});
    return {statut: "erreur"};
  }
}

// Garde le nom et la région de la fonction déjà installée dans Firebase :
// sa mise à jour ne crée donc ni second minuteur, ni notifications en double.
exports.notificationsEmma = onSchedule({
  schedule: "* * * * *",
  timeZone: ZONE,
  region: "us-central1",
  timeoutSeconds: 55,
  memory: "256MiB",
  maxInstances: 1,
}, async () => {
  const maintenant = maintenantParis();
  const instantane = await db.collection("emma_taches_notifications")
      .where("date", "==", maintenant.date)
      .get();

  const aEnvoyer = instantane.docs.filter((document) => {
    const notification = document.data();
    if (notification.envoyeeAt || notification.envoiEnCoursAt || notification.faite === true) return false;
    const debut = heureEnMinutes(notification.heure);
    if (debut === null) return false;
    const minuteEnvoi = debut - Math.max(0, Number(notification.rappelMinutes || 0));
    // Fenêtre courte pour absorber un éventuel retard du Scheduler sans envoyer d'ancien rappel.
    return maintenant.minute >= minuteEnvoi && maintenant.minute <= minuteEnvoi + 2;
  });

  const resultats = await Promise.all(aEnvoyer.map((document) => envoyerNotification(document.ref)));
  logger.info("Notifications EMMA vérifiées", {
    date: maintenant.date,
    minute: maintenant.minute,
    candidates: instantane.size,
    dues: aEnvoyer.length,
    resultats,
  });
});

// Calendrier Apple interroge l'URL sans session Firebase. Le lien utilise une
// clé aléatoire révocable, dont seul le condensat est enregistré côté serveur.
const {onRequest} = require("firebase-functions/v2/https");
const {getAuth} = require("firebase-admin/auth");
const {createHash} = require("node:crypto");

exports.calendrierEmma = onRequest({cors: [BASE_URL], invoker: "public"}, async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  if (req.method === "GET") {
    const key = req.query.key;
    if (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) {
      return res.status(404).end();
    }
    const hash = createHash("sha256").update(key).digest("hex");
    const feed = await db.collection("emma_calendar_feeds").doc(hash).get();
    if (!feed.exists) return res.status(404).end();
    return res.type("text/calendar; charset=utf-8").send(feed.data().calendar);
  }
  if (req.method !== "POST") return res.status(405).end();
  let owner;
  try {
    const bearer = /^Bearer (\S+)$/.exec(req.get("Authorization") || "");
    if (!bearer) return res.status(401).end();
    owner = await getAuth().verifyIdToken(bearer[1]);
  } catch {
    return res.status(401).end();
  }
  const {key, calendar, revoke} = req.body || {};
  if (!revoke && (typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key) ||
      typeof calendar !== "string" || Buffer.byteLength(calendar) > 200000 ||
      !calendar.startsWith("BEGIN:VCALENDAR\r\n") || !calendar.endsWith("END:VCALENDAR\r\n"))) {
    return res.status(400).end();
  }
  const links = db.collection("emma_calendar_feeds");
  const user = db.collection("emma_calendar_owners").doc(owner.uid);
  const hash = revoke ? null : createHash("sha256").update(key).digest("hex");
  await db.runTransaction(async (transaction) => {
    const current = (await transaction.get(user)).data()?.hash;
    const feed = hash ? await transaction.get(links.doc(hash)) : null;
    if (feed?.exists && feed.data().owner !== owner.uid) throw Error("Calendar link collision");
    if (current && current !== hash) transaction.delete(links.doc(current));
    if (revoke) transaction.delete(user);
    else {
      transaction.set(user, {hash});
      transaction.set(links.doc(hash), {calendar, owner: owner.uid});
    }
  });
  return res.status(204).end();
});
