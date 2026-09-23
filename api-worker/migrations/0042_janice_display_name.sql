-- 协作方账号 JaniceHi 已改名为 MaxEast。只改还停在旧展示名的那一条。
UPDATE workspace_users
SET display_name = 'MaxEast',
    avatar_char = 'M'
WHERE LOWER(REPLACE(REPLACE(REPLACE(display_name, ' ', ''), '-', ''), '_', '')) = 'janicehi';
