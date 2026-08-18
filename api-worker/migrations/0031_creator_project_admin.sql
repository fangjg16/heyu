-- 项目创建人在本项目内为 Admin（项目权限，不是平台管理员）
UPDATE project_member_roles pmr
INNER JOIN projects p ON p.id = pmr.project_id
SET pmr.role = 'admin'
WHERE p.created_by IS NOT NULL
  AND TRIM(p.created_by) <> ''
  AND p.created_by = pmr.user_id
  AND pmr.role <> 'admin'
  AND (pmr.deleted_at IS NULL OR pmr.deleted_at = '');
