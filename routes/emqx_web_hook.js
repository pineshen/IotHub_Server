var express = require('express');
var router = express.Router();
var Device = require("../models/device")
var messageService = require("../services/message_service")

router.post("/", function (req, res) {
    switch (req.body.action){
        case "client_connected":
            Device.addConnection(req.body)
            break
        case "client_disconnected":
            Device.removeConnection(req.body)
            break;
        case "message_publish":
            messageService.dispatchMessage({
                topic: req.body.topic,
                payload: new Buffer.from(req.body.payload, 'base64'),
                //payload: req.body.payload, //web_hook���û�ж���base64ʱʹ��
                ts: req.body.ts
            })
    }
    res.status(200).send("ok")
})

module.exports = router
