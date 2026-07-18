const AIAuditEvent = require('../../models/AI/AIAuditEvent');
const { safeAuditDetails, hashForAudit } = require('./redaction');

function requestIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  return forwarded ? String(forwarded).split(',')[0].trim() : (req?.ip || null);
}

async function record(event, req = null) {
  const retentionDays = Math.max(30, Math.min(3650, Number(process.env.AI_AUDIT_RETENTION_DAYS || 365)));
  const payload = {
    tenantId: event.tenantId,
    actorUserId: event.actorUserId || req?.user,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId ? String(event.resourceId) : null,
    matterId: event.matterId || null,
    taskId: event.taskId || null,
    provider: event.provider || null,
    model: event.model || null,
    outcome: event.outcome || 'success',
    details: safeAuditDetails(event.details),
    ipHash: hashForAudit(requestIp(req)),
    userAgent: String(req?.headers?.['user-agent'] || '').slice(0, 300) || null,
    retentionUntil: new Date(Date.now() + retentionDays * 86400000),
  };
  try {
    return await AIAuditEvent.create(payload);
  } catch (err) {
    // L'audit ne doit pas divulguer le contenu de l'événement dans les logs.
    console.error('[AI audit] écriture impossible:', err.code || err.name || 'ERROR');
    return null;
  }
}

module.exports = { record };
