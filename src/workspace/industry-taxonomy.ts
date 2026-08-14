/**
 * 行业分类：一级=主题板块；二级=可投子赛道/业务环节。
 * 存库格式：`主题板块 / 子赛道`；未选时为「未分类」。
 */

export type IndustryTheme = {
  theme: string;
  sectors: string[];
};

export const INDUSTRY_TAXONOMY: IndustryTheme[] = [
  {
    theme: "地产与建筑/资管",
    sectors: [
      "住宅开发与城更（旧改/保障房/棚改/城中村）",
      "商业地产（购物中心/写字楼/社区商业/存量改造）",
      "工业/物流地产（园区/仓储/冷库/数据中心载体）",
      "长租公寓/租赁住房/集中式与分散式运营",
      "物业管理与增值服务（保洁/安保/空间增值/社区金融）",
      "REITs 标的培育与资产运营（基础设施/园区/仓储/公寓）",
      "设计/造价/监理/EPC 总承包与装饰工程",
      "建材供应链与商贸（水泥/玻璃/门窗/内装一体化）",
    ],
  },
  {
    theme: "消费与零售",
    sectors: [
      "品牌消费（食品饮料/美妆个护/家清/宠物/母婴）",
      "专业连锁（茶饮/咖啡/烘焙/餐饮连锁/医美连锁/健身）",
      "线下新零售与渠道（社区店/仓店一体/奥莱/会员店）",
      "家居与耐用消费（家装/家居零售/家政与家装服务）",
      "二手与循环经济（闲置交易/回收/翻新）",
    ],
  },
  {
    theme: "现代服务业",
    sectors: [
      "人力资源与外包（招聘/派遣/BPO/灵活用工）",
      "法务/财税/咨询与合规服务",
      "检测/认证/计量与实验服务",
      "会展/营销/广告代理与内容制作",
      "物业后勤/园区运营/综合设施管理（IFM）",
    ],
  },
  {
    theme: "交通出行与汽车服务",
    sectors: [
      "客运与出行服务（网约车/城际客运/共享两轮）",
      "车后市场（维修保养/配件连锁/汽车美容/二手车经销）",
      "停车/路侧资源运营与ETC增值",
      "物流车/商用车运营与租赁",
    ],
  },
  {
    theme: "物流与供应链",
    sectors: [
      "快递/快运与同城即时配送",
      "仓配一体化与第三方仓储（标准仓/冷链/医药）",
      "干线/支线与多式联运、整车/零担网络",
      "货代与跨境物流、集运与海外仓",
      "供应链管理与贸易服务（采购执行/结算/金融配套）",
    ],
  },
  {
    theme: "工业与制造（传统工艺向）",
    sectors: [
      "通用机械与机床、工程机械与租赁",
      "电工电气与配电成套、泵阀管件",
      "过程工业装备（化工/冶金/建材/造纸）",
      "工业园区运营与设备运维服务（维保/OEM备件）",
      "第三方检修/改造/节能服务",
    ],
  },
  {
    theme: "农业与食品",
    sectors: [
      "种植/养殖与农服（区域龙头/合同农业）",
      "农资与渠道（肥料/农药/饲料/动保/农机销售与服务）",
      "食品加工与供应链（肉制品/乳制品/调味品/预制菜）",
      "冷链基础设施与食安检测/追溯",
    ],
  },
  {
    theme: "文旅与休闲",
    sectors: [
      "景区/文旅综合体/主题乐园开发与运营",
      "酒店与住宿（精选/中高端/长住/度假）",
      "演出赛事与体育娱乐、文体场馆运营",
      "旅行社/目的地服务与目的地零售",
    ],
  },
  {
    theme: "医疗健康（以服务与供给侧为主）",
    sectors: [
      "医院与专科连锁、康复/护理/养老",
      "体检与健康管理、医药零售与DTP",
      "医疗耗材流通与SPD/院内供应链",
      "民营医疗集团化并购与区域整合",
    ],
  },
  {
    theme: "教育与人力资本",
    sectors: [
      "职业教育/技能培训/职业资格",
      "早幼教/素质教育/托育（合规区域）",
      "企业培训与组织发展服务",
      "留学/语言/考试与出国服务",
    ],
  },
  {
    theme: "环保与公用事业",
    sectors: [
      "固废/危废/再生资源处理与运营",
      "水务/污水/海绵城市与市政运维",
      "大气治理与节能改造（EMC/合同能源管理）",
      "环卫一体化与园林绿化运营",
    ],
  },
  {
    theme: "能源与资源（传统向）",
    sectors: [
      "油气开采与油服、成品油流通与加油/加气站",
      "煤炭/矿业与选冶、散货港储",
      "传统电力与热力（电厂/区域热力/售电公司）",
      "化工品贸易与分销（基础化工/塑化品）",
    ],
  },
  {
    theme: "金融与资管",
    sectors: [
      "小贷/担保/保理/融资租赁",
      "消费金融与场景分期/联合贷服务商",
      "财富管理/FA/并购整合平台",
      "第三方支付与商户服务（不含技术栈）",
      "资管与资产运营平台（地产/物流/基础设施）",
    ],
  },
  {
    theme: "文化与传媒",
    sectors: [
      "出版/院线/发行与内容制作公司",
      "广告代理/整合营销/公关公司",
      "MCN/经纪与线下演出运营",
      "景观/文创/主题内容IP运营",
    ],
  },
];

export const UNCATEGORIZED_LABEL = "未分类";

export function formatIndustryCategory(theme: string, sector: string): string {
  const t = theme.trim();
  const s = sector.trim();
  if (!t) return UNCATEGORIZED_LABEL;
  if (!s) return t;
  return `${t} / ${s}`;
}

export function parseIndustryCategory(raw: string | null | undefined): {
  theme: string;
  sector: string;
  legacy: boolean;
} {
  const value = String(raw ?? "").trim();
  if (!value || value === UNCATEGORIZED_LABEL) {
    return { theme: "", sector: "", legacy: false };
  }
  const sep = value.includes(" / ") ? " / " : value.includes("/") ? "/" : null;
  if (sep) {
    const idx = value.indexOf(sep);
    const theme = value.slice(0, idx).trim();
    const sector = value.slice(idx + sep.length).trim();
    const known = INDUSTRY_TAXONOMY.find((item) => item.theme === theme);
    if (known && known.sectors.includes(sector)) {
      return { theme, sector, legacy: false };
    }
    if (known) return { theme, sector, legacy: true };
  }
  const themeOnly = INDUSTRY_TAXONOMY.find((item) => item.theme === value);
  if (themeOnly) return { theme: value, sector: "", legacy: false };
  return { theme: "", sector: "", legacy: true };
}

export function sectorsForTheme(theme: string): string[] {
  return INDUSTRY_TAXONOMY.find((item) => item.theme === theme)?.sectors ?? [];
}
