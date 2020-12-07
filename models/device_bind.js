var mongoose = require('mongoose');
var Schema = mongoose.Schema;

const DeviceBindSchema = new Schema({
    openid: String,
    product_name: String,
    device_name: String,
    device_alias: String, 
    bind_at: Number
}, { collection: 'device_bind' })

DeviceBindSchema.methods.toJSONObject = function () {
    return {
        openid: this.openid,
        product_name: this.product_name,
        device_name: this.device_name,
        device_alias: this.device_alias,
        bind_at: this.bind_at,
    }
}

const DeviceBind = mongoose.model("DeviceBind", DeviceBindSchema);

module.exports = DeviceBind
