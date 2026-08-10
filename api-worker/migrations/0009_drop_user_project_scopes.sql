-- 统一权限：目录可见性改由 openness + project_member_roles 决定，移除限定访客白名单表

DROP TABLE IF EXISTS user_project_scopes;
