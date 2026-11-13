-- One-time fix for inconsistent pending users having active=true
UPDATE users
   SET active = FALSE
 WHERE status IN ('pending_manager','pending_verification','pending_telegram');
