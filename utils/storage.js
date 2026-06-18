// utils/storage.js
// 本地存储工具（云端优先 + 本地缓存）

const sync = require('./sync')

const KEYS = {
  INSPIRATIONS: 'inspirations',
  USER_INFO: 'userInfo',
  TAGS: 'tags',
  SYNC_QUEUE: 'syncQueue',
  DRAFT: 'draft',
  PROJECTS: 'projects',
  PROJECT_MODE: 'projectMode'
}

// 项目卡片配色轮盘（参考 Microsoft Fluent Design 鲜艳色调）
const PROJECT_COLORS = [
  { name: '钴蓝', bg: '#B5D3F5', accent: '#1A6EC4', text: '#042C53' },
  { name: '翡翠', bg: '#A3DBC8', accent: '#0F7A5C', text: '#04342C' },
  { name: '紫晶', bg: '#C7C0F9', accent: '#6B5FD4', text: '#26215C' },
  { name: '玫红', bg: '#F0B5CE', accent: '#C4265E', text: '#4B1528' },
  { name: '金盏', bg: '#F3D180', accent: '#C47B16', text: '#412402' },
  { name: '朱砂', bg: '#EEAF9E', accent: '#C4462A', text: '#4A1B0C' },
  { name: '云灰', bg: '#D0CBBE', accent: '#69675E', text: '#2C2C2A' }
]

const COLOR_INDEX_KEY = '__project_color_index__'

function nextProjectColor() {
  let index = wx.getStorageSync(COLOR_INDEX_KEY) || 0
  const c = PROJECT_COLORS[index % PROJECT_COLORS.length]
  index++
  wx.setStorageSync(COLOR_INDEX_KEY, index)
  return c
}

// 颜色迁移版本号：升级配色后递增，确保只执行一次
const COLOR_MIGRATED_KEY = '__project_color_migrated_v2__'

function migrateProjectColors() {
  if (wx.getStorageSync(COLOR_MIGRATED_KEY)) return

  const projects = getProjects()
  if (projects.length === 0) {
    wx.setStorageSync(COLOR_MIGRATED_KEY, true)
    wx.setStorageSync(COLOR_INDEX_KEY, 0)
    return
  }

  // 按 sortOrder 排序后重新分配最新配色
  const sorted = [...projects].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))
  sorted.forEach((p, i) => {
    p.color = PROJECT_COLORS[i % PROJECT_COLORS.length]
    p.updatedAt = new Date().toISOString()
  })

  wx.setStorageSync(KEYS.PROJECTS, sorted)
  wx.setStorageSync(COLOR_INDEX_KEY, sorted.length)
  wx.setStorageSync(COLOR_MIGRATED_KEY, true)
}

// ============ 灵感相关 ============

function getInspirations() {
  return wx.getStorageSync(KEYS.INSPIRATIONS) || []
}

function saveInspiration(item) {
  const list = getInspirations()
  list.unshift(item)
  wx.setStorageSync(KEYS.INSPIRATIONS, list)
  addToSyncQueue(item.localId)
  // 云端同步创建
  sync.createInspiration(item).then(res => {
    if (res && res.code === 0 && res.data && res.data._id) {
      const freshList = getInspirations()
      const idx = freshList.findIndex(i => i.localId === item.localId)
      if (idx > -1) {
        freshList[idx].cloudId = res.data._id
        freshList[idx].synced = true
        wx.setStorageSync(KEYS.INSPIRATIONS, freshList)
        removeFromSyncQueue(item.localId)
      }
    }
  }).catch(() => {})
  return list
}

function updateInspiration(localId, updates) {
  const list = getInspirations()
  const idx = list.findIndex(i => i.localId === localId)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() }
  if (updates.supplement !== undefined) {
    list[idx].version = (list[idx].version || 1) + 1
    // 云端同步补充
    sync.supplementInspiration(localId, updates.supplement).catch(() => {})
  }
  wx.setStorageSync(KEYS.INSPIRATIONS, list)
  addToSyncQueue(localId)
  return list[idx]
}

function deleteInspiration(localId) {
  const list = getInspirations()
  const idx = list.findIndex(i => i.localId === localId)
  if (idx === -1) return false
  list[idx].isDeleted = true
  list[idx].synced = false
  wx.setStorageSync(KEYS.INSPIRATIONS, list)
  addToSyncQueue(localId)
  // 云端同步删除
  sync.removeInspiration(localId).catch(() => {})
  return true
}

function getInspirationByLocalId(localId) {
  const list = getInspirations()
  return list.find(i => i.localId === localId) || null
}

// ============ 草稿（续写功能）============

function saveDraft(content) {
  wx.setStorageSync(KEYS.DRAFT, {
    content: content,
    updatedAt: Date.now()
  })
}

function loadDraft() {
  const draft = wx.getStorageSync(KEYS.DRAFT)
  if (!draft) return null
  if (Date.now() - draft.updatedAt > 86400000) { // 24小时内有效
    clearDraft()
    return null
  }
  return draft.content
}

function clearDraft() {
  wx.removeStorageSync(KEYS.DRAFT)
}

// ============ 用户信息 ============

function getUserInfo() {
  return wx.getStorageSync(KEYS.USER_INFO) || null
}

function saveUserInfo(info) {
  wx.setStorageSync(KEYS.USER_INFO, info)
}

function isLoggedIn() {
  const info = getUserInfo()
  return !!(info && info.isLoggedIn)
}

// ============ 同步队列 ============

function getSyncQueue() {
  return wx.getStorageSync(KEYS.SYNC_QUEUE) || []
}

function addToSyncQueue(localId) {
  const queue = getSyncQueue()
  if (!queue.includes(localId)) {
    queue.push(localId)
    wx.setStorageSync(KEYS.SYNC_QUEUE, queue)
  }
}

function removeFromSyncQueue(localId) {
  let queue = getSyncQueue()
  queue = queue.filter(id => id !== localId)
  wx.setStorageSync(KEYS.SYNC_QUEUE, queue)
}

function clearSyncQueue() {
  wx.setStorageSync(KEYS.SYNC_QUEUE, [])
}

// ============ 标签缓存 ============

function getTags() {
  return wx.getStorageSync(KEYS.TAGS) || []
}

function saveTags(tags) {
  wx.setStorageSync(KEYS.TAGS, tags)
}

// ============ 容量管理 ============

function getStorageSize() {
  return new Promise((resolve) => {
    wx.getStorageInfo({
      success: (res) => resolve(res),
      fail: () => resolve(null)
    })
  })
}

// ============ 项目相关 ============

function getProjects() {
  return wx.getStorageSync(KEYS.PROJECTS) || []
}

function saveProject(project) {
  const list = getProjects()
  list.push(project)
  wx.setStorageSync(KEYS.PROJECTS, list)
  // 云端同步创建
  sync.manageProject('create', {
    localId: project._id,
    name: project.name,
    color: project.color
  }).catch(() => {})
  return list
}

function updateProject(projectId, updates) {
  const list = getProjects()
  const idx = list.findIndex(p => p._id === projectId)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() }
  wx.setStorageSync(KEYS.PROJECTS, list)
  // 云端同步更新
  sync.manageProject('update', {
    localId: projectId,
    name: updates.name
  }).catch(() => {})
  return list[idx]
}

function deleteProject(projectId) {
  const list = getProjects()
  const filtered = list.filter(p => p._id !== projectId)
  wx.setStorageSync(KEYS.PROJECTS, filtered)
  // 云端同步删除
  sync.manageProject('delete', { localId: projectId }).catch(() => {})
  return filtered
}

// 拖拽排序后持久化新顺序：传入项目 ID 数组（按新顺序排列）
function reorderProjects(orderedIds) {
  const list = getProjects()
  orderedIds.forEach((id, index) => {
    const p = list.find(proj => proj._id === id)
    if (p) p.sortOrder = index
  })
  wx.setStorageSync(KEYS.PROJECTS, list)
  return list
}

function getProjectById(projectId) {
  const list = getProjects()
  return list.find(p => p._id === projectId) || null
}

function getProjectInspirationCount(projectId) {
  const list = getInspirations()
  return list.filter(i => !i.isDeleted && i.projectId === projectId).length
}

function getProjectInspirationAbsorbedCount(projectId) {
  const list = getInspirations()
  return list.filter(i => !i.isDeleted && i.projectId === projectId && i.absorbed).length
}

// 获取项目列表，带灵感和活动时间统计
// 按 sortOrder 排序（支持拖拽自定义顺序），首次调用时自动为旧项目补全 sortOrder
function getProjectsWithStats() {
  const projects = getProjects()
  const inspirations = getInspirations().filter(i => !i.isDeleted)

  // 一次性迁移：为没有 sortOrder 的旧项目按当前顺序补全
  let needsMigration = false
  projects.forEach((p, idx) => {
    if (p.sortOrder === undefined) {
      p.sortOrder = idx
      needsMigration = true
    }
  })
  if (needsMigration) {
    wx.setStorageSync(KEYS.PROJECTS, projects)
  }

  return projects.map(p => {
    const projectInspirations = inspirations.filter(i => i.projectId === p._id)
    const absorbedCount = projectInspirations.filter(i => i.absorbed).length
    let lastActivityAt = p.createdAt
    if (projectInspirations.length > 0) {
      const sorted = [...projectInspirations].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      lastActivityAt = sorted[0].createdAt
    }
    return {
      ...p,
      count: projectInspirations.length,
      absorbedCount,
      unabsorbedCount: projectInspirations.length - absorbedCount,
      lastActivityAt
    }
  }).sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999))
}

// ============ 项目模式 ============

function getProjectMode() {
  return wx.getStorageSync(KEYS.PROJECT_MODE) || 'single'
}

function setProjectMode(mode) {
  wx.setStorageSync(KEYS.PROJECT_MODE, mode)
}

// 单→多切换：不再自动创建默认项目，灵感保持未分类状态
function migrateToMultiMode() {
  setProjectMode('multi')
  return { success: true }
}

// 多→单切换：取主项目，其他隐藏
// 多→单切换：取第一个项目
function migrateToSingleMode() {
  const projects = getProjectsWithStats()
  if (projects.length === 0) {
    setProjectMode('single')
    wx.removeStorageSync('__single_active_project__')
    return { success: true, mainProjectId: null }
  }

  const main = projects[0]

  setProjectMode('single')
  wx.setStorageSync('__single_active_project__', main._id)
  return { success: true, mainProjectId: main._id }
}

function getSingleModeProjectId() {
  return wx.getStorageSync('__single_active_project__') || null
}

Object.assign(module.exports, {
  getInspirations,
  saveInspiration,
  updateInspiration,
  deleteInspiration,
  getInspirationByLocalId,
  saveDraft,
  loadDraft,
  clearDraft,
  getUserInfo,
  saveUserInfo,
  isLoggedIn,
  getSyncQueue,
  addToSyncQueue,
  removeFromSyncQueue,
  clearSyncQueue,
  getTags,
  saveTags,
  getStorageSize,
  getProjects,
  saveProject,
  updateProject,
  deleteProject,
  getProjectById,
  getProjectInspirationCount,
  getProjectInspirationAbsorbedCount,
  getProjectsWithStats,
  reorderProjects,
  getProjectMode,
  setProjectMode,
  migrateToMultiMode,
  migrateToSingleMode,
  getSingleModeProjectId,
  nextProjectColor,
  migrateProjectColors,
  PROJECT_COLORS,
  KEYS
})
