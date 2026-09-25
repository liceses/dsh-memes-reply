/**
 * dsh-memes-reply — 情绪族表（**纯数据**，host 侧使用）。
 *
 * 为什么要有"族"这一层：JEV 对**窄候选集**的判断明显更可靠，实测
 * （`D:\developing\ai\JEV\meme-router`，2026-09-20）：
 *
 * | 问法 | 延迟 | 成本/轮 | 选中项 margin |
 * |---|---|---|---|
 * | 只问 13 族，族内由代码挑 | 1.3 s | $0.00005 | 0.30（族级，语义正确） |
 * | 族 → 具体张（两次调用） | 3.5 s | $0.0001 | 0.72 |
 * | 157 张直选（一次调用） | 1.0 s | $0.00022 | **0.02（糊）** |
 *
 * 结论：**语义判断留在"族"这一层，族内选哪张交回代码**（去重、变化、确定性都由代码保证）。
 * 这正是 JEV 文档的纪律——精确规则与算术用代码，Jev 只做判断。
 *
 * 族成员是**人工整理**的（157 张里 152 张归入 13 族，剩 5 张不收）。
 * 未收录的 id 不会消失：它们仍可被 `keyword` 模式、模型点名、`latch` 选中，
 * 只是不作为 JEV 的候选出现。`test/jev.test.mjs` 有一条回归盯着"表里的 id 必须真实存在"。
 */
/**
 * "没有情绪可贴"这一族。
 *
 * 它是**唯一允许 JEV 说"不贴"的出口**：纯技术输出（贴一行日志、贴个表格）时选它，
 * 于是"每轮必有鱼"不再是唯一选项。它不是贴纸，不会出现在族成员里。
 */
export const MOOD_BLANK = 'blank';
/** 13 个情绪族 + blank。顺序即诊断展示顺序。 */
export const MOOD_FAMILIES = [
    {
        key: 'celebrate',
        label: '庆祝 · 成事',
        gloss: '事情成了、收工、值得高兴（干杯、礼花、跳舞、起哄）',
        members: [
            'qingzhu', 'ganbei', 'fuhuojie', 'dayouxi', 'dangao',
            'tiaowu', 'tiaowu-sanwei', 'tiaowu-caramelldansen', 'tiaowu-helltaker', 'tiaowu-pizhichun',
            'qiaogun-1', 'qiaogun-2', 'qiaogun-3', 'dianfengshan-1', 'dianfengshan-2',
            'yingguangbang', 'jita', 'changge', 'kuoyinqi', 'defen-10',
        ],
    },
    {
        key: 'praise',
        label: '点赞 · 打气',
        gloss: '认可、表扬、给谁打气或安慰（点赞、满分、加油、没事的）',
        members: [
            'dianzan', 'dianzan-fan', 'all-good-1', 'all-good-2', 'all-good-3',
            'jiayou', 'ziwoanwei', 'diantou', 'notice-like', 'notice-star', 'notice-dianzan',
        ],
    },
    {
        key: 'bug',
        label: '翻车 · 自嘲',
        gloss: '出错、翻车、搞砸了、摆烂跑路（自嘲语气，不是真的生气）',
        members: [
            'bug', 'siwang', 'penji', 'touyun', 'xiaochou-1', 'xiaochou-2',
            'lajitong', 'fanzhuan', 'defen-0', 'popcat-frame', 'popcat-smooth',
            'zuolao-1', 'zuolao-2', 'tuoxie-1', 'tuoxie-2',
        ],
    },
    {
        key: 'sad',
        label: '委屈 · 害怕',
        gloss: '难过、委屈、害怕、紧张（真的低落，不是自嘲）',
        members: ['ku-1', 'ku-2', 'ku-3', 'beiji-tuoxie', 'haipa-1', 'haipa-2', 'jinzhang-1', 'jinzhang-2'],
    },
    {
        key: 'thinking',
        label: '思考 · 认真',
        gloss: '正在分析、讲清原理、准备交底（认真脸、墨镜、扇子）',
        members: [
            'sikao', 'sikao-renzhen', 'sikao-zixin',
            'mojing-fanguang', 'mojing-fanguang-pixel', 'mojing-xunhuan',
            'jiashi', 'paiying', 'zheshan',
        ],
    },
    {
        key: 'confused',
        label: '困惑 · 呆住',
        gloss: '没看懂、意外、愣住、一脸问号（抓拍、呆滞）',
        members: [
            'wenhao', 'jingxia', 'tanhao', 'yaomi',
            'dai-1', 'dai-2', 'dai-3', 'dai-tiezhi-1', 'dai-tiezhi-2', 'dai-tiezhi-3',
            'zhuapai-phone', 'zhuapai-camera',
        ],
    },
    {
        key: 'tired',
        label: '摸鱼 · 想睡',
        gloss: '累了、想摸鱼、想睡、吃瓜看戏（活干太多或干脆不想干）',
        members: [
            'mojing-zhai', 'gongzuo', 'gongzuo-pijuan', 'gongzuo-xiaoshui',
            'shuijiao', 'shuijiao-uu', 'shuijiao-zhunbei-1', 'shuijiao-zhunbei-2',
            'cuimian', 'yaokele', 'chi-xigua', 'chi-baomihua', 'chi-tiantianquan', 'motou',
        ],
    },
    {
        key: 'angry',
        label: '不满 · 叫停',
        gloss: '明确不满、叫停、警告、反对、翻白眼（带态度的拒绝）',
        members: [
            'shengqi', 'gongzuo-shengqi', 'dazi-shengqi', 'dazi-naonu',
            'yaotou', 'jingyin-1', 'jingyin-2', 'tingzhi-gongzuo',
            'qiang', 'dao-1', 'dao-2', 'zhi', 'daixin-lashi-hard', 'daixin-lashi-easy',
        ],
    },
    {
        key: 'shy',
        label: '害羞 · 卖萌',
        gloss: '被夸到不好意思、扭捏、卖萌、撒娇（软乎乎）',
        members: [
            'haixiu-1', 'haixiu-2', 'xiao-zhi', 'xiao', 'zhayan',
            'huaban', 'mofa', 'chan-daocha', 'chan-kuaizi', 'tiantian',
        ],
    },
    {
        key: 'greet',
        label: '打招呼 · 收尾',
        gloss: '开场寒暄、回应问候、道别、露个头（社交性的，不是情绪）',
        members: [
            'dazhaohu-1', 'dazhaohu-2', 'qiaotou', 'maopao-1', 'maopao-2',
            'he-yinliao', 'anniu', 'shuaka', 'liuqi', 'liuqi-dai',
        ],
    },
    {
        key: 'notice',
        label: '提醒 · 交代',
        gloss: '要提醒风险、指重点、交代清楚（"注意""这里别忘"）',
        members: [
            'zhuyi', 'jiaodai', 'notice-bits', 'notice-coin', 'notice-custom',
            'raid-1', 'raid-2', 'jilu-1', 'jilu-2',
        ],
    },
    {
        key: 'gift',
        label: '送礼 · 表白',
        gloss: '送东西、发钱、爱心、玫瑰、情书（表达好感的实体动作）',
        members: [
            'liwu-1', 'liwu-2', 'meigui', 'hongbao-1', 'hongbao-2', 'qian', 'naqian',
            'beiji-yingbi', 'aixin-1', 'aixin-2', 'aixin-3', 'beiji-aixin', 'qingshu',
        ],
    },
    {
        key: 'expect',
        label: '期待 · 稍等',
        gloss: '在等结果、拭目以待、请稍等、快到了（期待感）',
        members: ['qidai-1', 'qidai-2', 'shao-1', 'shao-2', 'daoda', 'daoda-shaozi', 'daoda-kuaizi'],
    },
];
/** 搜索用的索引（一次性建好）。 */
const BY_KEY = new Map(MOOD_FAMILIES.map((family) => [family.key, family]));
/** 按 key 取一族。 */
export function familyOf(key) {
    if (key === null || key === undefined || key === '')
        return undefined;
    return BY_KEY.get(key);
}
/** JEV choice 的 criteria：`{familyKey: gloss}` + blank。 */
export function familyCriteria() {
    const criteria = {};
    for (const family of MOOD_FAMILIES)
        criteria[family.key] = family.gloss;
    criteria[MOOD_BLANK] = '这条回复没有任何情绪可贴（纯技术输出、纯数据、纯日志）';
    return criteria;
}
/**
 * 所有族成员（去重后），用于回归校验"表里的 id 真实存在"。
 * 同一个 id 被写进两族时这里发现不了，交给测试里的显式查重。
 */
export function allFamilyMembers() {
    const out = [];
    for (const family of MOOD_FAMILIES)
        out.push(...family.members);
    return out;
}
//# sourceMappingURL=moods.js.map