// pages/detail/detail.js
const storage = require('../../utils/storage')

Page({
  data: {
    localId: '',
    item: null,
    isEditing: false,
    editContent: '',
    editSupplement: '',
    isDeleting: false,
    showShareMenu: false,
    shareCardPath: '',
    imageList: [],
    // 项目信息
    projectName: '',
    // 时间显示
    displayDate: '',
    displayTime: ''
  },

  onLoad(options) {
    const localId = options.localId
    if (!localId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }
    this.setData({ localId })
    this.loadItem()

    // 从分享卡片进入，自动弹出分享菜单
    if (options.openShare === '1') {
      setTimeout(() => {
        this.setData({ showShareMenu: true })
      }, 500)
    }
  },

  onShow() {
    if (this.data.localId) {
      this.loadItem()
    }
  },

  // 加载灵感详情
  loadItem() {
    const item = storage.getInspirationByLocalId(this.data.localId)
    if (!item || item.isDeleted) {
      wx.showToast({ title: '灵感已被删除', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }

    // 格式化时间
    const createdAt = new Date(item.createdAt)
    const dateStr = createdAt.getFullYear() + '年' +
      (createdAt.getMonth() + 1) + '月' + createdAt.getDate() + '日'
    const timeStr = String(createdAt.getHours()).padStart(2, '0') + ':' +
      String(createdAt.getMinutes()).padStart(2, '0')

    // 获取项目名称
    let projectName = ''
    if (item.projectId) {
      const project = storage.getProjectById(item.projectId)
      if (project) projectName = project.name
    }

    // 收集图片列表
    const imageList = item.images || []

    this.setData({
      item,
      imageList,
      projectName,
      displayDate: dateStr,
      displayTime: timeStr,
      editContent: item.content || '',
      editSupplement: item.supplement || ''
    })
  },

  // 进入编辑模式
  onStartEdit() {
    this.setData({
      isEditing: true,
      editContent: this.data.item.content || '',
      editSupplement: this.data.item.supplement || ''
    })
  },

  // 取消编辑
  onCancelEdit() {
    // 如果有修改但未保存，询问
    const item = this.data.item
    const changed =
      this.data.editContent !== (item.content || '') ||
      this.data.editSupplement !== (item.supplement || '')
    if (changed) {
      wx.showModal({
        title: '放弃修改？',
        content: '修改内容将不会保存',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              isEditing: false,
              editContent: item.content || '',
              editSupplement: item.supplement || ''
            })
          }
        }
      })
    } else {
      this.setData({ isEditing: false })
    }
  },

  // 内容输入
  onContentInput(e) {
    this.setData({ editContent: e.detail.value })
  },

  // 补充内容输入
  onSupplementInput(e) {
    this.setData({ editSupplement: e.detail.value })
  },

  // 保存编辑
  onSaveEdit() {
    const content = this.data.editContent.trim()
    if (!content && this.data.imageList.length === 0) {
      wx.showToast({ title: '内容不能为空', icon: 'none' })
      return
    }

    const updates = {
      content: content || this.data.item.content,
      supplement: this.data.editSupplement.trim()
    }

    const updated = storage.updateInspiration(this.data.localId, updates)
    if (updated) {
      this.setData({
        item: updated,
        isEditing: false
      })
      wx.showToast({ title: '已保存', icon: 'success' })

      // 触发首页刷新
      const pages = getCurrentPages()
      const prevPage = pages[pages.length - 2]
      if (prevPage) {
        prevPage.onShow && prevPage.onShow()
      }
    } else {
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  },

  // 删除灵感
  onDelete() {
    this.setData({ isDeleting: false })
    wx.showModal({
      title: '删除灵感',
      content: '删除后无法恢复，确定要删除吗？',
      confirmColor: '#FF3B30',
      success: (res) => {
        if (res.confirm) {
          storage.deleteInspiration(this.data.localId)
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        }
      }
    })
  },

  // 复制内容
  onCopy() {
    const item = this.data.item
    const text = [item.content || '', item.supplement || ''].filter(Boolean).join('\n')
    wx.setClipboardData({
      data: text,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      }
    })
  },

  // 切换吸收状态
  onToggleAbsorb() {
    const absorbed = !this.data.item.absorbed
    const updated = storage.updateInspiration(this.data.localId, { absorbed })
    if (updated) {
      this.setData({
        item: updated,
        ['item.absorbed']: absorbed
      })
      wx.vibrateShort({ type: 'medium' })
      wx.showToast({
        title: absorbed ? '已标记吸收' : '已取消吸收',
        icon: 'none'
      })
    }
  },

  // 分享
  onShare() {
    this.setData({ showShareMenu: true })
  },

  onCloseShareMenu() {
    this.setData({ showShareMenu: false })
  },

  // 分享卡片生成完毕
  onShareCardReady(e) {
    this.setData({ shareCardPath: e.detail.path })
  },

  // 预览图片
  onPreviewImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = this.data.imageList
    if (images.length === 0) return
    wx.previewImage({
      current: images[idx] || images[0],
      urls: images
    })
  },

  // 返回上一页
  onBack() {
    wx.navigateBack()
  },

  // 更多操作
  onShowMore() {
    const item = this.data.item
    wx.showActionSheet({
      itemList: ['复制内容', '分享', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.onCopy()
        } else if (res.tapIndex === 1) {
          this.onShare()
        } else if (res.tapIndex === 2) {
          this.onDelete()
        }
      }
    })
  },

  // 页面分享
  onShareAppMessage() {
    const item = this.data.item
    const shareData = {
      title: (item.content || '灵感').substring(0, 30),
      path: '/pages/detail/detail?localId=' + this.data.localId
    }
    // 如果有生成的分享卡片，使用它作为分享图
    if (this.data.shareCardPath) {
      shareData.imageUrl = this.data.shareCardPath
    }
    return shareData
  }
})
