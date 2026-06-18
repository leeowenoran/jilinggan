// pages/index/index.js
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')
const app = getApp()

Page({
  data: {
    // 项目模式
    isMultiMode: false,
    projectMode: 'single',
    currentProjectId: '',
    currentProjectName: '',
    projects: [],          // 项目列表（带统计）

    // 输入
    inputValue: '',
    pendingImages: [],

    // 灵感列表
    groups: [],
    totalCount: 0,
    absorbedCount: 0,
    unabsorbedCount: 0,
    showAbsorbed: false,    // 是否显示已吸收的灵感（默认隐藏）
    unclassifiedCount: 0,  // 多项目模式下未分类灵感数
    unclassifiedAbsorbed: 0,

    // UI
    showLoginBar: false,
    showGetUserInfo: false,
    loading: false,
    isLoggedIn: false,
    nickName: '',
    avatarUrl: '',
    
    // 选择模式
    selectMode: false,
    selectedIds: [],

    // 项目排序模式
    sortMode: false,
    sortProjects: [],      // 排序模式下使用的项目列表（含 _sortY）
    sortAreaHeight: 0,     // movable-area 高度（px）
    _sortCardHeightPx: 0   // 排序卡片高度（px，运行时计算）
  },

  onLoad(options) {
    // 配色迁移（只执行一次）
    storage.migrateProjectColors()

    const mode = storage.getProjectMode()
    const isMulti = mode === 'multi'

    // 恢复续写草稿
    const draft = app.globalData.draftContent || storage.loadDraft()
    if (draft) {
      this.setData({ inputValue: draft })
      app.globalData.draftContent = ''
    }

    // 从项目卡片点进来 (多项目模式下的某个项目)
    if (isMulti && options.projectId) {
      this.setData({
        isMultiMode: true,
        projectMode: 'multi',
        currentProjectId: options.projectId,
        currentProjectName: decodeURIComponent(options.projectName || ''),
        // 进入项目流不显示项目列表
        projects: []
      })
      this.loadInspirations(options.projectId)
    } else if (isMulti) {
      // 多项目首页：清空 currentProjectId，确保渲染项目卡片列表
      this.setData({
        isMultiMode: true,
        projectMode: 'multi',
        currentProjectId: '',
        currentProjectName: '',
        groups: [],
        totalCount: 0
      })
      this.loadProjects()
    } else {
      // 单项目模式：显示所有灵感，不绑定任何项目
      this.setData({
        isMultiMode: false,
        projectMode: 'single',
        currentProjectId: '',
        currentProjectName: '',
        projects: []
      })
      this.loadInspirations()
    }

    this.loadUserInfo()
    this._firstShow = true
  },

  onShow() {
    if (this._firstShow) {
      this._firstShow = false
      // 检测模式是否被设置页改动
      const mode = storage.getProjectMode()
      if (mode !== this.data.projectMode) {
        // 模式变了，重新加载
        this.onLoad({})
        return
      }
      return
    }

    // 每次显示刷新
    const mode = storage.getProjectMode()
    if (mode !== this.data.projectMode) {
      this.onLoad({})
      return
    }

    if (this.data.isMultiMode && !this.data.currentProjectId) {
      this.loadProjects()
    } else {
      this.loadInspirations(this.data.currentProjectId || undefined)
    }

    this.loadUserInfo()
    if (storage.isLoggedIn()) {
      sync.syncUpload()
    }
  },

  // ============ 加载项目列表 ============
  loadProjects() {
    const projects = storage.getProjectsWithStats()

    // 统计未分类灵感数量（projectId 为空或在已有项目中找不到对应项目）
    const allInspirations = storage.getInspirations().filter(i => !i.isDeleted)
    const projectIds = new Set(projects.map(p => p._id))
    const unclassified = allInspirations.filter(i => !i.projectId || !projectIds.has(i.projectId))
    const unclassifiedCount = unclassified.length
    const unclassifiedAbsorbed = unclassified.filter(i => i.absorbed).length

    this.setData({ projects, unclassifiedCount, unclassifiedAbsorbed })
  },

  // ============ 加载用户信息 ============
  loadUserInfo() {
    const userInfo = storage.getUserInfo()
    const loggedIn = storage.isLoggedIn()
    this.setData({
      isLoggedIn: loggedIn,
      nickName: (userInfo && userInfo.nickName) || '',
      avatarUrl: (userInfo && userInfo.avatarUrl) || ''
    })
  },

  // ============ 加载灵感列表（按日期分组） ============
  loadInspirations(projectId) {
    const list = storage.getInspirations()
    let active = list.filter(i => !i.isDeleted)

    if (projectId === '__unclassified__') {
      // 多项目模式：未分类（projectId 为空，或 projectId 指向不存在的项目）
      const allProjects = storage.getProjects()
      const projectIds = new Set(allProjects.map(p => p._id))
      active = active.filter(i => !i.projectId || !projectIds.has(i.projectId))
    } else if (projectId) {
      // 多项目模式：指定项目
      active = active.filter(i => i.projectId === projectId)
    } else if (this.data.isMultiMode) {
      // 多项目首页不显示灵感流
      active = []
    }
    // 单项目模式：不过滤，显示所有灵感

    // 统计已吸收/未吸收
    const absorbedCount = active.filter(i => i.absorbed).length
    const unabsorbedCount = active.length - absorbedCount

    // 默认隐藏已吸收
    if (!this.data.showAbsorbed) {
      active = active.filter(i => !i.absorbed)
    }

    active.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    // 注入项目名称（单项目模式 & 多项目子页面显示项目标签）
    const projectMap = {}
    const allProjects = storage.getProjects()
    allProjects.forEach(p => { projectMap[p._id] = p.name })
    active.forEach(item => {
      item._projectName = item.projectId ? (projectMap[item.projectId] || '') : ''
    })

    // 按 dateTag 分组
    const groupMap = {}
    active.forEach(item => {
      const key = item.dateTag || item.createdAt.split('T')[0]
      if (!groupMap[key]) groupMap[key] = []
      groupMap[key].push(item)
    })

    const today = new Date()
    const todayStr = today.getFullYear() + '-' + (today.getMonth()+1).toString().padStart(2,'0') + '-' + today.getDate().toString().padStart(2,'0')
    const yesterday = new Date(today - 86400000)
    const yesterdayStr = yesterday.getFullYear() + '-' + (yesterday.getMonth()+1).toString().padStart(2,'0') + '-' + yesterday.getDate().toString().padStart(2,'0')

    const groups = Object.keys(groupMap)
      .sort((a, b) => b.localeCompare(a))
      .map(date => {
        let dateLabel
        if (date === todayStr) {
          dateLabel = '今天'
        } else if (date === yesterdayStr) {
          dateLabel = '昨天'
        } else {
          const parts = date.split('-')
          const month = parseInt(parts[1])
          const day = parseInt(parts[2])
          const year = parseInt(parts[0])
          dateLabel = year === today.getFullYear()
            ? month + '月' + day + '日'
            : year + '年' + month + '月' + day + '日'
        }
        return { date, dateLabel, items: groupMap[date] }
      })

    this.setData({ groups, totalCount: active.length, absorbedCount, unabsorbedCount })
  },

  // ============ 项目导航 ============
  onTapProject(e) {
    const project = e.detail.project
    if (project._id === '__unclassified__') {
      wx.reLaunch({
        url: '/pages/index/index?projectId=__unclassified__&projectName=' + encodeURIComponent('未分类')
      })
      return
    }
    wx.reLaunch({
      url: '/pages/index/index?projectId=' + project._id + '&projectName=' + encodeURIComponent(project.name)
    })
  },

  onTapUnclassified() {
    wx.reLaunch({
      url: '/pages/index/index?projectId=__unclassified__&projectName=' + encodeURIComponent('未分类')
    })
  },

  // 从项目灵感流返回项目列表
  onBackToProjects() {
    wx.reLaunch({ url: '/pages/index/index' })
  },

  // ============ 输入相关 ============
  onInput(e) {
    const value = e.detail.value
    this.setData({ inputValue: value })
    if (this._draftTimer) clearTimeout(this._draftTimer)
    this._draftTimer = setTimeout(() => {
      storage.saveDraft(value)
    }, 1000)
  },

  // ============ 粘贴内容到输入框 ============
  onPaste() {
    wx.getClipboardData({
      success: (res) => {
        const pasted = (res.data || '').trim()
        if (!pasted) return
        const current = this.data.inputValue || ''
        const newValue = current ? current + '\n' + pasted : pasted
        this.setData({ inputValue: newValue })
        storage.saveDraft(newValue)
      }
    })
  },

  // ============ 图片选择 ============
  onPickImages() {
    const current = this.data.pendingImages.length
    const remain = 9 - current
    if (remain <= 0) {
      wx.showToast({ title: '最多添加 9 张图片', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newFiles = res.tempFiles.map(f => ({
          tempFilePath: f.tempFilePath,
          size: f.size
        }))
        this.setData({
          pendingImages: this.data.pendingImages.concat(newFiles)
        })
      }
    })
  },

  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index
    const list = [...this.data.pendingImages]
    list.splice(idx, 1)
    this.setData({ pendingImages: list })
  },

  onPreviewPendingImage(e) {
    const idx = e.currentTarget.dataset.index
    const urls = this.data.pendingImages.map(i => i.tempFilePath)
    wx.previewImage({ current: urls[idx], urls })
  },

  // ============ 提交灵感 ============
  async onSubmit() {
    const content = this.data.inputValue.trim()
    const images = this.data.pendingImages
    if (!content && images.length === 0) return

    // 实时内容安全检测（仅云可用时）
    if (sync.checkCloudAvailable()) {
      wx.showLoading({ title: '检测中…', mask: true })
      try {
        const checkRes = await new Promise((resolve, reject) => {
          wx.cloud.callFunction({
            name: 'checkText',
            data: { content },
            success: (res) => resolve(res.result),
            fail: (err) => reject(err)
          })
        })
        wx.hideLoading()
        if (checkRes && checkRes.safe === false) {
          wx.showToast({ title: '内容未通过安全检测，请修改', icon: 'none' })
          return
        }
      } catch (e) {
        wx.hideLoading()
        console.warn('内容检测失败，继续保存:', e.message)
        // 检测接口出错不阻断用户 —— 云同步时 syncUpload 会再次检测
      }
    }

    const localId = 'local_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)
    const now = new Date().toISOString()
    const dateTag = now.split('T')[0]
    const tags = content ? this.extractTags(content) : []

    // 确定 projectId
    let projectId = ''
    if (this.data.isMultiMode && this.data.currentProjectId && this.data.currentProjectId !== '__unclassified__') {
      // 多项目模式下处于某个具体项目中
      projectId = this.data.currentProjectId
    }
    // 单项目模式 或 多项目"未分类"视图下：projectId 留空

    const item = {
      localId: localId,
      content: content,
      tags: tags,
      timeSlot: this.getTimeSlot(now),
      supplement: '',
      source: images.length > 0 ? (content ? 'text' : 'image') : 'text',
      voiceFileId: '',
      images: images.map(i => i.tempFilePath),
      createdAt: now,
      updatedAt: now,
      dateTag: dateTag,
      version: 1,
      isDeleted: false,
      absorbed: false,
      synced: false,
      cloudId: '',
      projectId: projectId,
      location: null
    }

    storage.saveInspiration(item)

    // 取消未触发的草稿定时器，防止 clearDraft 后又被定时器写回旧值
    if (this._draftTimer) {
      clearTimeout(this._draftTimer)
      this._draftTimer = null
    }
    storage.clearDraft()

    this.setData({ inputValue: '', pendingImages: [] })
    this.loadInspirations(this.data.currentProjectId || undefined)

    if (!storage.isLoggedIn()) {
      const list = storage.getInspirations()
      const total = list.filter(i => !i.isDeleted).length
      if (total === 1) {
        this.setData({ showLoginBar: true })
      }
    }

    if (storage.isLoggedIn()) {
      sync.syncUpload()
    }

    // 定位功能已关闭（审核要求 wx.getLocation 权限，笔记类非刚需）
    // this._fetchLocation(localId)
  },

  // _fetchLocation / _saveLocation 已禁用 — 记灵感无需自动标记位置
  // _fetchLocation(localId) {
  //   wx.getLocation({ ... })
  // },
  // _saveLocation(localId, location) {
  //   storage.updateInspiration(localId, { location })
  //   ...
  // },

  extractTags(content) {
    const regex = /#([\u4e00-\u9fa5a-zA-Z0-9]{1,10})/g
    const tags = []
    let match
    while ((match = regex.exec(content)) !== null) {
      const tag = match[1].toLowerCase()
      if (!tags.includes(tag)) tags.push(tag)
    }
    return tags
  },

  getTimeSlot(isoString) {
    const hour = new Date(isoString).getHours()
    if (hour >= 0 && hour < 6) return '深夜'
    if (hour >= 6 && hour < 12) return '早晨'
    if (hour >= 12 && hour < 18) return '下午'
    return '晚上'
  },

  // ============ 灵感卡片操作 ============
  onTapInspiration(e) {
    const item = e.detail.item
    wx.navigateTo({
      url: '/pages/detail/detail?localId=' + item.localId
    })
  },

  onShareInspiration(e) {
    const item = e.detail.item
    if (!item) return
    wx.navigateTo({
      url: '/pages/detail/detail?localId=' + item.localId + '&openShare=1'
    })
  },

  onDeleteInspiration(e) {
    const item = e.detail.item
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复',
      success: (res) => {
        if (res.confirm) {
          storage.deleteInspiration(item.localId)
          this.loadInspirations(this.data.currentProjectId || undefined)
        }
      }
    })
  },

  // ============ 选择模式 ============
  onEnterSelectMode() {
    this.setData({ selectMode: true, selectedIds: [] })
  },

  onExitSelectMode() {
    this.setData({ selectMode: false, selectedIds: [] })
  },

  onToggleSelect(e) {
    const localId = e.detail.item.localId
    let ids = [...this.data.selectedIds]
    const idx = ids.indexOf(localId)
    if (idx > -1) {
      ids.splice(idx, 1)
    } else {
      ids.push(localId)
    }
    this.setData({ selectedIds: ids })
  },

  onConvertToProject() {
    const count = this.data.selectedIds.length
    if (count === 0) return

    // 取第一条灵感内容前12个字作为默认项目名
    const allInspirations = storage.getInspirations()
    const firstSelected = allInspirations.find(i => i.localId === this.data.selectedIds[0])
    const defaultName = firstSelected
      ? firstSelected.content.replace(/#\S+/g, '').trim().substring(0, 12)
      : ''

    wx.showModal({
      title: '转为项目',
      editable: true,
      placeholderText: '输入项目名称',
      content: defaultName,
      success: (res) => {
        if (res.confirm) {
          const name = (res.content && res.content.trim()) || defaultName || '未命名项目'
          const color = storage.nextProjectColor()
          const projects = storage.getProjects()
          const projectId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)
          const project = {
            _id: projectId,
            name: name,
            color: color,
            sortOrder: projects.length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
          storage.saveProject(project)

          // 批量更新选中灵感的 projectId
          this.data.selectedIds.forEach(localId => {
            storage.updateInspiration(localId, { projectId: projectId })
          })

          // 退出选择模式，跳转到新项目
          this.setData({ selectMode: false, selectedIds: [] })
          wx.reLaunch({
            url: '/pages/index/index?projectId=' + projectId + '&projectName=' + encodeURIComponent(name)
          })
          wx.showToast({ title: '已创建项目「' + name + '」', icon: 'success' })
        }
      }
    })
  },

  // ============ 吸收操作 ============

  // 单条灵感标记已吸收/取消吸收（来自卡片右滑）
  onMarkAbsorbed(e) {
    const { item, absorbed } = e.detail
    storage.updateInspiration(item.localId, { absorbed })
    this.loadInspirations(this.data.currentProjectId || undefined)
    wx.showToast({
      title: absorbed ? '已标记吸收' : '已取消吸收',
      icon: 'none',
      duration: 1000
    })
  },

  // 批量标记吸收（来自管理多选模式）
  onBatchMarkAbsorbed() {
    const count = this.data.selectedIds.length
    if (count === 0) return

    wx.showModal({
      title: '标记吸收',
      content: '将 ' + count + ' 条灵感标记为已吸收？',
      confirmText: '标记',
      success: (res) => {
        if (res.confirm) {
          this.data.selectedIds.forEach(localId => {
            storage.updateInspiration(localId, { absorbed: true })
          })
          this.setData({ selectMode: false, selectedIds: [] })
          this.loadInspirations(this.data.currentProjectId || undefined)
          wx.showToast({ title: '已标记 ' + count + ' 条', icon: 'success' })
        }
      }
    })
  },

  // 批量删除（来自管理多选模式）
  onBatchDelete() {
    const count = this.data.selectedIds.length
    if (count === 0) return

    wx.showModal({
      title: '删除灵感',
      content: '确定删除 ' + count + ' 条灵感？删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          this.data.selectedIds.forEach(localId => {
            storage.deleteInspiration(localId)
          })
          this.setData({ selectMode: false, selectedIds: [] })
          this.loadInspirations(this.data.currentProjectId || undefined)
          wx.showToast({ title: '已删除 ' + count + ' 条', icon: 'success' })
        }
      }
    })
  },

  // 切换是否显示已吸收
  onToggleShowAbsorbed() {
    const next = !this.data.showAbsorbed
    this.setData({ showAbsorbed: next })
    this.loadInspirations(this.data.currentProjectId || undefined)
  },

  // ============ 登录 ============
  onLogin() {
    wx.showLoading({ title: '登录中...' })
    sync.login().then(res => {
      wx.hideLoading()
      if (res.success) {
        this.setData({ showLoginBar: false })
        this.loadUserInfo()
        if (!res.nickName) {
          wx.showToast({ title: '登录成功', icon: 'success', duration: 1000 })
          setTimeout(() => {
            this.setData({ showGetUserInfo: true })
          }, 1000)
        } else {
          wx.showToast({ title: '登录成功', icon: 'success' })
        }
      } else {
        wx.showToast({ title: res.error || '登录失败', icon: 'none', duration: 2500 })
      }
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '登录失败', icon: 'none' })
    })
  },

  onDismissLoginBar() {
    this.setData({ showLoginBar: false })
  },

  onGetUserInfo(e) {
    this.setData({ showGetUserInfo: false })
    const userInfo = e.detail.userInfo
    if (userInfo && userInfo.nickName && userInfo.nickName !== '微信用户') {
      wx.showLoading({ title: '同步资料...' })
      sync.updateProfile({
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl || ''
      }).then(result => {
        wx.hideLoading()
        if (result.success) {
          storage.saveUserInfo({
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl || ''
          })
          this.setData({
            nickName: userInfo.nickName,
            avatarUrl: userInfo.avatarUrl || ''
          })
          wx.showToast({ title: '已同步微信资料', icon: 'success' })
        } else {
          wx.showToast({ title: '同步失败，请手动设置', icon: 'none' })
        }
      }).catch(() => {
        wx.hideLoading()
        wx.showToast({ title: '同步失败，请手动设置', icon: 'none' })
      })
    } else {
      this.goToSettingsForProfile()
    }
  },

  onDismissGetUserInfo() {
    this.setData({ showGetUserInfo: false })
    this.goToSettingsForProfile()
  },

  goToSettingsForProfile() {
    getApp().globalData.pendingSettingsFlag = 'newUser'
    wx.switchTab({ url: '/pages/settings/settings' })
  },

  // ============ 导航 ============
  onGoSettings() {
    wx.switchTab({ url: '/pages/settings/settings' })
  },

  onGoSearch() {
    wx.switchTab({ url: '/pages/search/search' })
  },

  // ============ 新建项目（多项目首页快捷入口）============
  onCreateProject() {
    wx.showModal({
      title: '新建项目',
      editable: true,
      placeholderText: '输入项目名称',
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          const name = res.content.trim()
          const color = storage.nextProjectColor()
          const projects = storage.getProjects()
          const project = {
            _id: 'proj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
            name: name,
            color: color,
            sortOrder: projects.length,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
          storage.saveProject(project)
          this.loadProjects()
          wx.showToast({ title: '项目已创建', icon: 'success' })
        }
      }
    })
  },

  // ============ 项目管理（长按卡片）============
  onLongPressProject(e) {
    // 防止 longpress 事件重复触发（微信 bindlongpress 已知问题）
    if (this._actionSheetOpen) return
    this._actionSheetOpen = true

    const project = e.detail.project

    const itemList = ['重命名', '删除项目']

    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        if (res.tapIndex === 0) {
          this.renameProject(project)
        } else if (res.tapIndex === 1) {
          this.deleteProject(project)
        }
      },
      complete: () => {
        this._actionSheetOpen = false
      }
    })
  },

  renameProject(project) {
    wx.showModal({
      title: '重命名项目',
      editable: true,
      placeholderText: '输入新名称',
      content: project.name,
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          const newName = res.content.trim()
          storage.updateProject(project._id, { name: newName })
          this.loadProjects()
          wx.showToast({ title: '已重命名', icon: 'success' })
        }
      }
    })
  },

  deleteProject(project) {
    wx.showModal({
      title: '删除项目',
      content: '删除「' + project.name + '」后，该项目的灵感将变为无归属（不会丢失）。确认删除？',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          storage.deleteProject(project._id)
          const remaining = storage.getProjects()
          if (remaining.length === 0) {
            // 删除了最后一个项目 → 自动切换到单项目模式
            storage.setProjectMode('single')
            this.onLoad({})
          } else {
            this.loadProjects()
          }
          wx.showToast({ title: '已删除', icon: 'success' })
        }
      }
    })
  },

  // ============ 项目排序 ============

  // 进入 / 退出排序模式
  // 可接受 highlightId 参数，高亮指定卡片
  onToggleSortMode(highlightId) {
    if (this.data.sortMode) {
      // 退出：按当前顺序持久化
      const orderedIds = this.data.sortProjects.map(p => p._id)
      storage.reorderProjects(orderedIds)
      this.setData({ sortMode: false, sortProjects: [] })
      this.loadProjects()
      return
    }

    // 进入排序模式：计算卡片高度（px），构建 sortProjects
    const sysInfo = wx.getSystemInfoSync()
    const windowWidth = sysInfo.windowWidth
    const SORT_CARD_RPX = 156   // 卡片高度 + 间距（rpx）
    const cardHeightPx = Math.round(SORT_CARD_RPX * windowWidth / 750)
    const projects = this.data.projects
    const sortProjects = projects.map((p, i) => ({
      ...p,
      _sortY: i * cardHeightPx,
      _highlight: highlightId ? p._id === highlightId : false
    }))
    const sortAreaHeight = projects.length * cardHeightPx

    this._sortCardHeightPx = cardHeightPx
    this._dragIndex = undefined

    this.setData({
      sortMode: true,
      sortProjects,
      sortAreaHeight
    })
  },

  // movable-view 位置变化回调
  onSortItemChange(e) {
    const { source, y } = e.detail
    const index = e.currentTarget.dataset.index

    if (source === 'touch') {
      // 实时拖拽中：检测是否越过其他条目，动态重排
      this._dragIndex = index
      this._reorderLive(y, index)
    } else if (source === '') {
      // 拖拽结束（松手后 damping 动画归位触发）
      this._dragIndex = undefined
      this._lastHoverIndex = undefined
    }
  },

  // 手指离开时确保最终对齐
  onSortTouchEnd() {
    this._dragIndex = undefined
    this._lastHoverIndex = undefined
    // 确保所有条目 Y 坐标与最终顺序对齐
    const cardH = this._sortCardHeightPx
    if (!cardH) return
    const sortProjects = this.data.sortProjects.map((p, i) => ({
      ...p,
      _sortY: i * cardH
    }))
    this.setData({ sortProjects })
  },

  // 实时重排：拖拽过程中根据 Y 坐标动态调整其他条目位置，产生"让位"动画
  _reorderLive(y, fromIndex) {
    const cardH = this._sortCardHeightPx
    if (!cardH || !this.data.sortProjects.length) return

    // 计算当前手指对应的目标索引（半个卡片高度偏移，手感更自然）
    let toIndex = Math.round((y + cardH / 2) / cardH)
    toIndex = Math.max(0, Math.min(toIndex, this.data.sortProjects.length - 1))

    if (toIndex === fromIndex) {
      this._lastHoverIndex = undefined
      return
    }
    if (toIndex === this._lastHoverIndex) return  // 目标位置未变，跳过

    this._lastHoverIndex = toIndex

    // 重排数组
    const sortProjects = [...this.data.sortProjects]
    const [item] = sortProjects.splice(fromIndex, 1)
    sortProjects.splice(toIndex, 0, item)

    // 更新所有条目的 _sortY
    // 非拖拽条目 → 平滑动画到新位置（"让位"效果）
    // 被拖拽条目 → 跟随手指，_sortY 更新不影响视觉
    sortProjects.forEach((p, i) => { p._sortY = i * cardH })

    this.setData({ sortProjects })
    this._dragIndex = toIndex  // 更新拖拽条目在新数组中的索引
  },

  // ============ 分享给朋友 ============
  onShareAppMessage(options) {
    return {
      title: '记灵感 - 随时记录突发灵感',
      path: '/pages/index/index'
    }
  },

  // ============ 下拉刷新 ============
  onPullDownRefresh() {
    if (this.data.isMultiMode && !this.data.currentProjectId) {
      this.loadProjects()
      wx.stopPullDownRefresh()
      return
    }
    if (storage.isLoggedIn()) {
      sync.syncDownload().then(() => {
        this.loadInspirations(this.data.currentProjectId || undefined)
        wx.stopPullDownRefresh()
      })
    } else {
      wx.stopPullDownRefresh()
    }
  }
})
