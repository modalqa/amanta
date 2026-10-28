-- Integrity guards that Prisma schema syntax cannot express.

-- Audit trail is append-only. Deletion is only allowed when an operator explicitly
-- enables purge for the current transaction (e.g. a documented tenant offboarding).
CREATE OR REPLACE FUNCTION amanta_audit_log_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'AuditLog is append-only (UPDATE rejected)';
  END IF;
  IF TG_OP = 'DELETE' AND coalesce(current_setting('amanta.allow_audit_purge', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'AuditLog is append-only (DELETE rejected)';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION amanta_audit_log_guard();

-- Risk matrix bounds (1..5).
ALTER TABLE "HaccpControl" ADD CONSTRAINT "HaccpControl_severity_check" CHECK ("severity" BETWEEN 1 AND 5);
ALTER TABLE "HaccpControl" ADD CONSTRAINT "HaccpControl_likelihood_check" CHECK ("likelihood" BETWEEN 1 AND 5);

-- Quantities must be non-negative.
ALTER TABLE "IngredientLot" ADD CONSTRAINT "IngredientLot_quantity_check" CHECK ("quantity" >= 0);
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_quantity_check" CHECK ("quantity" >= 0);
ALTER TABLE "BatchInput" ADD CONSTRAINT "BatchInput_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_quantity_check" CHECK ("quantity" > 0);
