import type { PluginMetadata } from '@/plugins/plugin'
import type { DashboardTab } from '../../../components/style/home-redesign/dashboard/tabs/dashboard-tabs'

export const plugin: PluginMetadata = {
  name: 'dashboardHome.aiAgent',
  displayName: '仪表盘首页 - AI 助手',
  author: {
    name: 'ajtn123',
    link: 'https://github.com/ajtn123',
  },
  setup({ addData }) {
    addData('dashboardHome.tabs', (tabs: DashboardTab[]) => {
      tabs.push({
        id: 'ai-agent',
        name: 'AI 助手',
        component: () => import('./AgentTab.vue').then(module => module.default),
      })
    })
  },
}
