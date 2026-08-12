self.addEventListener("push", event => {

    let payload = {};

    try {
        payload = event.data
            ? event.data.json()
            : {};
    } catch (e) {
        console.error("Push EMMA illisible", e);
        payload = {};
    }

    console.log("Push EMMA reçu :", payload);


    // Firebase peut placer le contenu
    // dans notification ou directement à la racine.
    const notification =
        payload.notification || {};

    const customData =
        payload.data || {};


    const titre =
        notification.title ||
        payload.title ||
        customData.title ||
        "EMMA ✨";


    const body =
        notification.body ||
        payload.body ||
        customData.body ||
        "Tu as une nouvelle notification";


    // URL précise envoyée par functions/index.js
    const url =
        customData.url ||
        notification.data?.url ||
        payload.fcmOptions?.link ||
        payload.fcm_options?.link ||
        "/emma/";


    const options = {

        body,

        icon:
            "/emma/emma-icon.png",

        badge:
            "/emma/emma-icon.png",

        tag:
            notification.tag ||
            customData.id ||
            "emma",

        data: {
            url,

            module:
                customData.module || "",

            type:
                customData.type || "",

            id:
                customData.id || ""
        }
    };


    event.waitUntil(
        self.registration.showNotification(
            titre,
            options
        )
    );

});



self.addEventListener(
    "notificationclick",
    event => {

        event.notification.close();

        const url =
            event.notification.data?.url ||
            "/emma/";


        event.waitUntil(

            clients
                .matchAll({
                    type: "window",
                    includeUncontrolled: true
                })
                .then(windowClients => {

                    // Si EMMA est déjà ouverte,
                    // on réutilise la fenêtre.
                    for(const client of windowClients){

                        if("focus" in client){

                            return client
                                .navigate(url)
                                .then(() =>
                                    client.focus()
                                );

                        }
                    }

                    // Sinon on ouvre EMMA.
                    return clients.openWindow(url);

                })

        );

    }
);
