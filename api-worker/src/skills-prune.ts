/** 卷上已有的 skill 名；库里多出来的应删掉（仓库已移除的收购包等）。 */
export function skillNamesMissingFromVolume(
  dbNames: string[],
  volumeNames: string[],
): string[] {
  const vol = new Set(volumeNames);
  return dbNames.filter((name) => name && !vol.has(name));
}

export function isReadOnlyVolumeError(message: string): boolean {
  const m = String(message ?? "");
  return (
    /EROFS|read-only file system|EACCES/iu.test(m) ||
    /ENOENT:.*mkdir/iu.test(m)
  );
}

export const READ_ONLY_VOLUME_HINT =
  "Skill 目录是只读挂载（跟 git）。不能把库写回磁盘。请改点「同步到 MySQL」；仓库里已删除的 skill 会从库中去掉。";
