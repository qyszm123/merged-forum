UPDATE train_work_submissions
SET status = 'pending_teacher', requires_defense = 0
WHERE status IN ('pending_defense', 'defense_failed', 'defense_passed', 'machine_failed', 'machine_passed');

SELECT status, COUNT(*) AS c FROM train_work_submissions GROUP BY status;
