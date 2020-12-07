var express = require('express');
var router = express.Router();
var shortid = require("shortid")
var jwt = require('jsonwebtoken')

//这个值应该和EMQX etc/plugins/emqx_auth_jwt.conf中的保存一致
const jwtSecret = process.env.JWT_SECRET

router.post("/", function (req, res) {
    var username = req.body.username //shortid.generate()
    var password = jwt.sign({
        username: username,
        exp: Math.floor(Date.now() / 1000) + 10
    }, jwtSecret)
    res.json({username: username, password: password})
})

module.exports = router
