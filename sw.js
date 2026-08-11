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

        icon: "/emma/emma-icon.png",
badge: "/emma/emma-icon.png",

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
