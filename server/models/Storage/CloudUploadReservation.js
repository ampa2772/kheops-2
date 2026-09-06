const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: {type:String, required:true},
  provider: {type:String, required:true},
  accountRef: {type:mongoose.Schema.Types.ObjectId, required:true},
  key: {type:String, required:true},
  containerId: {type:String, required:true},
  checksum: {type:String, required:true},
  remoteId: {type:String, required:true},
}, {timestamps:true});
schema.index({provider:1,accountRef:1,key:1},{unique:true});
module.exports=mongoose.model('CloudUploadReservation',schema);
