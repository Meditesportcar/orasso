-- Mise en service du règlement de J+2 (lot 06) : les événements déjà terminés depuis plus de 48 h n'ont jamais eu de
-- pointage ; ils sont marqués réglés sans aucune écriture de points, sinon le premier balayage donnerait un malus à
-- tous leurs retenus.
UPDATE "events" SET "settled_at" = now()
WHERE "settled_at" IS NULL AND "ends_at" < now() - interval '48 hours';
