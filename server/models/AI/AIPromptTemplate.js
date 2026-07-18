const mongoose = require('mongoose');

const AIPromptTemplateSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  templateId: { type: String, required: true, index: true },
  version: { type: Number, required: true, min: 1 },
  taskType: { type: String, required: true, index: true },
  locale: { type: String, default: 'fr-FR' },
  systemInstruction: { type: String, required: true, maxlength: 30000 },
  userTemplate: { type: String, required: true, maxlength: 30000 },
  outputSchema: { type: mongoose.Schema.Types.Mixed, default: null },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

AIPromptTemplateSchema.index({ tenantId: 1, templateId: 1, version: 1 }, { unique: true });

module.exports = mongoose.models.AIPromptTemplate
  || mongoose.model('AIPromptTemplate', AIPromptTemplateSchema);
