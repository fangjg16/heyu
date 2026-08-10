-- 账号默认角色统一为 guest；项目内权限仅由 project_member_roles 决定
UPDATE workspace_users SET default_role = 'guest' WHERE default_role <> 'guest';
