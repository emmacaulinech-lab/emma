self.addEventListener("push", event => {

    let data = {};

    try{
        data = event.data
            ? event.data.json()
            : {};
    }catch(e){
        data = {};
    }

    const titre =
        data.title || "EMMA ✨";

    const options = {
        body:
            data.body ||
            "Tu as une nouvelle notification",

        icon:
            "/emma/icon-192.png",

        badge:
            "/emma/icon-192.png",

        data:{
            url:
                data.url ||
                "/emma/"
        }
    };

    event.waitUntil(
        self.registration
            .showNotification(
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
            clients.openWindow(url)
        );
    }
);
