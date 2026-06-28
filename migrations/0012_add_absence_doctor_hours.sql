ALTER TABLE absence_requests ADD COLUMN unit TEXT NOT NULL DEFAULT 'days';
ALTER TABLE absence_requests ADD COLUMN start_time TEXT;
ALTER TABLE absence_requests ADD COLUMN end_time TEXT;
ALTER TABLE absence_requests ADD COLUMN hours REAL;
