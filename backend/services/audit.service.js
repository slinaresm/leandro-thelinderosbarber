const { randomUUID } = require('crypto');

// Keep an immutable, application-level trail for sensitive business changes.
async function audit(db, { actorUserId = null, entityType, entityId, action, before = null, after = null }) {
  await db.prepare(`INSERT INTO audit_log (id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), actorUserId, entityType, entityId, action,
      before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
}

module.exports = { audit };
