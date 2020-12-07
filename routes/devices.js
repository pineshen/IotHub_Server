var express = require('express');
var Device = require("../models/device")
var shortid = require("shortid")
var router = express.Router();
var Connection = require('../models/connection')
var UtilsService = require('../services/utils_service')
var DeviceACL = require("../models/device_acl")
var DeviceBind = require("../models/device_bind")


router.post("/", function (req, res) {
    var productName = req.body.product_name
    var deviceName = req.body.device_mac
    var secret = shortid.generate();
    var brokerUsername = `${productName}/${deviceName}`


    var device = new Device({
        product_name: productName,
        device_name: deviceName,
        secret: secret,
        broker_username: brokerUsername,
        status: "active"
    })

    device.save(function (err) {
        if (err) {
            res.status(500).send(err)
        } else {
            var aclRule = device.getACLRule()
            var deviceACL = new DeviceACL({
                broker_username: device.broker_username,
                publish: aclRule.publish,
                subscribe: aclRule.subscribe,
                pubsub: aclRule.pubsub
            })
            deviceACL.save(function () {
                res.json({product_name: productName, device_name: deviceName, secret: secret})
            })
        }
    })
})

router.get("/:productName/:deviceName", function (req, res) {
    var productName = req.params.productName
    var deviceName = req.params.deviceName
    Device.findOne({"product_name": productName, "device_name": deviceName}).exec(function (err, device) {
        if (err) {
            res.send(err)
        } else {
            if (device != null) {
                Connection.find({device: device._id}, function (_, connections) {
                    res.json(Object.assign(device.toJSONObject(), {
                        connections: connections.map(function (conn) {
                            return conn.toJSONObject()
                        })
                    }))
                })
            } else {
                res.status(404).json({error: "Not Found"})
            }
        }
    })
})

router.delete("/:productName/:deviceName", function (req, res) {
    var productName = req.params.productName
    var deviceName = req.params.deviceName
    Device.findOne({"product_name": productName, "device_name": deviceName}).exec(function (err, device) {
        if (err) {
            res.send(err)
        } else {
            if (device != null) {
                device.disconnect()
                device.remove()
                res.status(200).send("ok")
            } else {
                res.status(404).json({error: "Not Found"})
            }
        }
    })
})

router.get("/:productName", function (req, res) {
    var productName = req.params.productName
    Device.find({"product_name": productName}, function (err, devices) {
        if (err) {
            res.send(err)
        } else {
            res.json(devices.map(function (device) {
                return device.toJSONObject()
            }))

        }
    })
})

router.put("/:productName/:deviceName/suspend", function (req, res) {
    var productName = req.params.productName
    var deviceName = req.params.deviceName
    Device.findOneAndUpdate({"product_name": productName, "device_name": deviceName},
        {status: "suspended"}, {useFindAndModify: false}).exec(function (err, device) {
        if (err) {
            res.send(err)
        } else {
            if (device != null) {
                device.disconnect()
            }
            res.status(200).send("ok")
        }
    })
})

router.put("/:productName/:deviceName/resume", function (req, res) {
    var productName = req.params.productName
    var deviceName = req.params.deviceName
    Device.findOneAndUpdate({"product_name": productName, "device_name": deviceName},
        {status: "active"}, {useFindAndModify: false}).exec(function (err) {
        if (err) {
            res.send(err)
        } else {
            res.status(200).send("ok")
        }
    })
})

router.post("/:productName/:deviceName/command", function (req, res) {
    var productName = req.params.productName
    var deviceName = req.params.deviceName
    var useRpc = (req.body.use_rpc == "true")
    Device.findOne({"product_name": productName, "device_name": deviceName}, function (err, device) {
        if (err) {
            res.send(err)
        } else if (device != null) {
            var ttl = req.body.ttl != null ? parseInt(req.body.ttl) : null
            if (useRpc) {
                ttl = 5
            }
            var requestId = device.sendCommand({
                commandName: req.body.command,
                data: req.body.data,
                encoding: req.body.encoding || "plain",
                ttl: ttl,
                commandType: useRpc ? "rpc" : "cmd"
            })
            if (useRpc) {
                UtilsService.waitKey(`cmd_resp/${requestId}`, ttl, function (val) {
                    if (val == null) {
                        res.status(200).json({error: "device timeout"})
                    } else {
                        res.status(200).json({response: val.toString("base64")})
                    }
                })
            } else {
                res.status(200).json({request_id: requestId})
            }
        } else {
            res.status(404).send("device not found")
        }
    })
})
router.put("/:productName/:deviceName/tags", function (req, res) {
    var productName = req.params.productName
    var deviceName = req.params.deviceName
    var tags = req.body.tags.split(",")
    Device.findOne({"product_name": productName, "device_name": deviceName}, function (err, device) {
        if (err != null) {
            res.send(err)
        } else if (device != null) {
            device.tags = tags
            device.tags_version += 1
            device.save()
            device.sendTags()
            res.status(200).send("ok")
        } else {
            res.status(404).send("device not found")
        }

    })
})

router.put("/:productName/:deviceName/shadow", function (req, res) {
    var productName = req.params.productName
    var deviceName = req.params.deviceName
    Device.findOne({"product_name": productName, "device_name": deviceName}, function (err, device) {
        if (err != null) {
            res.send(err)
        } else if (device != null) {
            if(device.updateShadowDesired(req.body.desired, req.body.version)){
                res.status(200).send("ok")
            }else{
                res.status(409).send("version out of date")
            }
        } else {
            res.status(404).send("device not found")
        }

    })
})

router.post("/:productName/:deviceName/bind", function (req, res) {
    var productName = req.params.productName
    var deviceName = req.params.deviceName
    var alias = req.body.alias
    var openid = req.body.openid

    DeviceBind.findOne({"product_name": productName, "device_name": deviceName, "openid": openid}).exec(function (err, devicebind) {
        if (err) {
            res.send(err)
        } else {
            if (devicebind == null) {
                var devicebind = new DeviceBind({
                    openid: openid,
                    product_name: productName,
                    device_name: deviceName,
                    device_alias: alias,
                    bind_at: (new Date()).getTime()
                })
                devicebind.save(function (err) {
                    if (err) {
                        res.status(500).send(err)
                    } else {
                        res.status(200).send("ok")
                    }
                })
            } else {
                res.status(200).send("ok")
            }
        }
    })
})

router.delete("/:productName/:deviceName/unbind", function (req, res) {
    var productName = req.params.productName
    var deviceName = req.params.deviceName
    var openid = req.body.openid
    DeviceBind.find({"product_name": productName, "device_name": deviceName, "openid": openid}).exec(function (err, devicebind) {
        if (err) {
            res.send(err)
        } else {
            if (devicebind != null) {
                DeviceBind.deleteMany({"product_name": productName, "device_name": deviceName, "openid": openid}).exec()
                res.status(200).send("ok")
            } else {
                res.status(404).json({error: "Not Found"})
            }
        }
    })
})

router.post("/:productName/:deviceName/reset", function (req, res) {
    var productName = req.params.productName
    var deviceName = req.params.deviceName
    DeviceBind.find({"product_name": productName, "device_name": deviceName}).exec(function (err, devicebinds) {
        if (err) {
            res.send(err)
        } else {
            if (devicebinds != null) {
                DeviceBind.deleteMany({"product_name": productName, "device_name": deviceName}).exec()
                res.status(200).send("ok")
            } else {
                res.status(404).json({error: "Not Found"})
            }
        }
    })
})

router.get("/:productName/:deviceName/online", function (req, res) {
    var productName = req.params.productName
    var deviceName = req.params.deviceName
    Device.findOne({"product_name": productName, "device_name": deviceName}).exec(function (err, device) {
        if (err) {
            res.send(err)
        } else {
            if (device != null) {
                Connection.findOne({device: device._id}, function (_, connection) {
                    res.json({product_name: productName, device_name: deviceName, online: connection.connected})
                })
            } else {
                res.status(404).json({error: "Not Found"})
            }
        }
    })
})


module.exports = router