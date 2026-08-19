/**
 * 项目广场：已登录账号可发现全开放项目。
 * 在某个项目里是投资方还是项目协作方，只影响该项目，不挡广场。
 */
export function membershipsAllowPlazaDiscovery(
  _roles?: Iterable<string>,
): boolean {
  return true;
}
