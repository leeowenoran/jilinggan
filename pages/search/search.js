// pages/search/search.js
const storage = require('../../utils/storage')

Page({
  data: {
    keyword: '',
    results: [],
    allTags: [],
    activeTag: '',
    placeholder: '搜索灵感内容...',
    showClear: false
  },

  onLoad() {
    this.loadAllTags()
  },

  onShow() {
    // 每次进入聚焦搜索框
  },

  // 加载所有标签
  loadAllTags() {
    const list = storage.getInspirations()
    const tagSet = new Set()
    list.forEach(item => {
      if (!item.isDeleted && item.tags) {
        item.tags.forEach(t => tagSet.add(t))
      }
    })
    this.setData({ allTags: Array.from(tagSet) })
  },

  // 搜索输入
  onInput(e) {
    const keyword = e.detail.value.trim()
    this.setData({
      keyword,
      showClear: keyword.length > 0
    })
    if (keyword) {
      this.doSearch(keyword)
    } else {
      this.setData({ results: [] })
    }
  },

  // 执行搜索
  doSearch(keyword) {
    const list = storage.getInspirations()
    const kw = keyword.toLowerCase()

    // 构建项目名映射
    const allProjects = storage.getProjects()
    const projectMap = {}
    allProjects.forEach(p => { projectMap[p._id] = p.name })

    const results = list
      .filter(item => {
        if (item.isDeleted) return false
        // 搜索正文
        if (item.content && item.content.toLowerCase().includes(kw)) return true
        // 搜索补充内容
        if (item.supplement && item.supplement.toLowerCase().includes(kw)) return true
        // 搜索标签
        if (item.tags && item.tags.some(t => t.toLowerCase().includes(kw))) return true
        return false
      })
      .map(item => ({
        ...item,
        _projectName: item.projectId ? (projectMap[item.projectId] || '') : ''
      }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

    this.setData({ results })
  },

  // 点击标签筛选
  onTapTag(e) {
    const tag = e.currentTarget.dataset.tag
    const activeTag = this.data.activeTag === tag ? '' : tag
    this.setData({ activeTag })

    if (activeTag) {
      this.doSearch(activeTag)
      this.setData({ keyword: '#' + activeTag })
    } else {
      const kw = this.data.keyword.replace(/^#\S*/, '').trim()
      if (kw) {
        this.doSearch(kw)
      } else {
        this.setData({ results: [], keyword: '' })
      }
    }
  },

  // 清除搜索
  onClear() {
    this.setData({
      keyword: '',
      results: [],
      showClear: false,
      activeTag: ''
    })
  },

  // 点击搜索结果
  onTapResult(e) {
    const localId = e.currentTarget.dataset.localid
    wx.navigateTo({
      url: '/pages/detail/detail?localId=' + localId
    })
  },

  // 确认搜索
  onConfirm(e) {
    const keyword = e.detail.value.trim()
    if (keyword) {
      this.doSearch(keyword)
    }
  }
})
