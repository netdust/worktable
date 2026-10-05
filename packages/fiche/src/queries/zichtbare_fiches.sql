SELECT id, titel, type, gemeente, postcode, prioriteit FROM fiche WHERE deleted_at IS NULL AND verborgen = 0 ORDER BY prioriteit DESC, titel
