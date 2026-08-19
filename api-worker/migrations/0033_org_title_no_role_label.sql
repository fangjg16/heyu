-- 隶属组织去掉误写的权限档文案；遗留列不再表示账号身份
UPDATE workspace_users
  SET org_title = TRIM(TRAILING ' · Admin' FROM org_title)
  WHERE org_title LIKE '% · Admin';
UPDATE workspace_users
  SET org_title = TRIM(TRAILING ' · Core 核心级' FROM org_title)
  WHERE org_title LIKE '% · Core 核心级';
UPDATE workspace_users
  SET org_title = TRIM(TRAILING ' · Core' FROM org_title)
  WHERE org_title LIKE '% · Core';
UPDATE workspace_users
  SET org_title = TRIM(TRAILING ' · Basic 基础级' FROM org_title)
  WHERE org_title LIKE '% · Basic 基础级';
UPDATE workspace_users
  SET org_title = TRIM(TRAILING ' · Basic' FROM org_title)
  WHERE org_title LIKE '% · Basic';
UPDATE workspace_users
  SET org_title = TRIM(TRAILING ' · Advanced 进阶级' FROM org_title)
  WHERE org_title LIKE '% · Advanced 进阶级';
UPDATE workspace_users
  SET org_title = TRIM(TRAILING ' · Advanced' FROM org_title)
  WHERE org_title LIKE '% · Advanced';
UPDATE workspace_users
  SET org_title = TRIM(TRAILING ' · Guest' FROM org_title)
  WHERE org_title LIKE '% · Guest';

ALTER TABLE workspace_users
  MODIFY COLUMN default_role VARCHAR(32) NOT NULL DEFAULT 'guest' COMMENT '遗留列，不表示账号身份；项目权限只在项目成员里';
