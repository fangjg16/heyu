-- 只把仍使用旧登录名 janicehi 的那条改成 maxeast_co。
-- 已经改过登录名的不再动，避免每次迁移把系统里的修改盖回去。
UPDATE workspace_users
SET
  username = 'maxeast_co',
  password_hash = 'c888cfb084b78062a237c7cdc367158dc89b99aaaf5345e68ea8cfdcec000377',
  password_salt = 'a1c3e5b79d2f4068ab12cd34ef567890',
  password_iters = 120000
WHERE id = 'janice-hi'
  AND LOWER(username) = 'janicehi';
