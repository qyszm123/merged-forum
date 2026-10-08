/**
 * 商业 / 3D 打印扩展单元（与计算机/物联网同等「章→关→刷题/作品」结构）
 * 由 trainCatalog 引用；题库见 build-train-banks-ext.cjs
 */
module.exports = {
  business: [
    {
      id: 'biz-u1',
      name: '初级 · 用户与痛点',
      tier: 'beginner',
      nodes: [
        { id: 'biz-user', name: '用户与场景访谈', type: 'quiz' },
        { id: 'biz-pain', name: '槽点拆解与优先级', type: 'quiz' },
        { id: 'biz-persona', name: '人物画像一页纸', type: 'work' },
        { id: 'biz-prd', name: '一页纸需求说明', type: 'work' }
      ]
    },
    {
      id: 'biz-u2',
      name: '初级 · 方案与验证',
      tier: 'beginner',
      nodes: [
        { id: 'biz-solution', name: '方案三角：问题-方案-价值', type: 'quiz' },
        { id: 'biz-mvp', name: '最小可行产品边界', type: 'quiz' },
        { id: 'biz-validate', name: '校园验证计划', type: 'work' },
        { id: 'biz-u2-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'biz-u3',
      name: '中级 · 商业表达',
      tier: 'intermediate',
      nodes: [
        { id: 'biz-pitch', name: '30 秒电梯演讲', type: 'quiz' },
        { id: 'biz-price', name: '积分与定价直觉', type: 'quiz' },
        { id: 'biz-story', name: '故事板与演示脚本', type: 'work' },
        { id: 'biz-channel', name: '渠道与触达设计', type: 'work' }
      ]
    },
    {
      id: 'biz-u4',
      name: '中级 · 增长与运营',
      tier: 'intermediate',
      nodes: [
        { id: 'biz-funnel', name: '转化漏斗初识', type: 'quiz' },
        { id: 'biz-retention', name: '留存与习惯养成', type: 'quiz' },
        { id: 'biz-ops', name: '一周运营排期', type: 'work' },
        { id: 'biz-u4-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'biz-u5',
      name: '高级 · 指标与复盘',
      tier: 'advanced',
      nodes: [
        { id: 'biz-metric', name: '北极星指标初识', type: 'quiz' },
        { id: 'biz-ab', name: '对照实验直觉', type: 'quiz' },
        { id: 'biz-dashboard', name: '指标看板草图', type: 'work' },
        { id: 'biz-review', name: '复盘与迭代节奏', type: 'work' }
      ]
    },
    {
      id: 'biz-u6',
      name: '高级 · 商业闭环',
      tier: 'advanced',
      nodes: [
        { id: 'biz-risk', name: '合规与风险清单', type: 'quiz' },
        { id: 'biz-team', name: '角色分工与协作', type: 'quiz' },
        { id: 'biz-roadmap', name: '三月路线图', type: 'work' },
        { id: 'biz-finale', name: '商业路演终关', type: 'work' },
        { id: 'biz-boss', name: '产品思维 · 通关', type: 'reward' }
      ]
    }
  ],
  print: [
    {
      id: 'print-u1',
      name: '初级 · 认识增材制造',
      tier: 'beginner',
      nodes: [
        { id: 'print-model', name: '认识切片与层高', type: 'quiz' },
        { id: 'print-safe', name: '打印安全与材料', type: 'quiz' },
        { id: 'print-pipeline', name: '从模型到 G-code', type: 'work' },
        { id: 'print-u1-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'print-u2',
      name: '初级 · 建模与可打印性',
      tier: 'beginner',
      nodes: [
        { id: 'print-cad', name: '基础建模约束', type: 'quiz' },
        { id: 'print-wall', name: '壁厚与悬空', type: 'quiz' },
        { id: 'print-fix', name: '可打印零件设计', type: 'work' },
        { id: 'print-u2-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'print-u3',
      name: '中级 · 切片与工艺',
      tier: 'intermediate',
      nodes: [
        { id: 'print-slice', name: '填充与支撑策略', type: 'quiz' },
        { id: 'print-temp', name: '温度与速度权衡', type: 'quiz' },
        { id: 'print-tune', name: '工艺参数实验记录', type: 'work' },
        { id: 'print-u3-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'print-u4',
      name: '中级 · 装配与后处理',
      tier: 'intermediate',
      nodes: [
        { id: 'print-post', name: '去支撑与表面处理', type: 'quiz' },
        { id: 'print-fit', name: '公差与装配', type: 'quiz' },
        { id: 'print-assemble', name: '多件装配作品', type: 'work' },
        { id: 'print-u4-innov', name: '再设计与微创新', type: 'work' }
      ]
    },
    {
      id: 'print-u5',
      name: '高级 · 校园应用与通关',
      tier: 'advanced',
      nodes: [
        { id: 'print-campus', name: '校园场景选型', type: 'quiz' },
        { id: 'print-cost', name: '成本与时间估算', type: 'quiz' },
        { id: 'print-make', name: '完成一件小作品', type: 'work' },
        { id: 'print-show', name: '作品展示与说明', type: 'work' },
        { id: 'print-boss', name: 'DIY 打印高手 · 通关', type: 'reward' }
      ]
    }
  ]
}
