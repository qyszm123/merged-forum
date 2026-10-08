SELECT path_id, title, visibility, owner_user_id, LEFT(IFNULL(reward_identity,''), 24) AS rid
FROM train_courses
ORDER BY updated_at DESC
LIMIT 30;
