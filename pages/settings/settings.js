// pages/settings/settings.js
const storage = require('../../utils/storage')
const sync = require('../../utils/sync')
const app = getApp()

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    nickName: '',
    avatarUrl: '',
    isNewUser: false,
    focusNickInput: false,
    isEditing: false,
    // 项目相关
    projectMode: 'single',
    switchChecked: false
  },

  onLoad(options) {
    // 处理 navigateTo 遗留的 query 参数（兼容旧版）
    if (options && options.newUser === '1') {
      this.setData({ isNewUser: true })
      setTimeout(() => {
        this.setData({ focusNickInput: true })
      }, 500)
    }
    this.loadData()
  },

  onShow() {
    // 检查 switchTab 带来的标记
    if (app.globalData.pendingSettingsFlag === 'newUser') {
      app.globalData.pendingSettingsFlag = null
      this.setData({ isNewUser: true })
      setTimeout(() => {
        this.setData({ focusNickInput: true })
      }, 500)
    }
    if (this._savingProfile) {
      this._savingProfile = false
      return
    }
    this.loadData()
  },

  loadData() {
    const userInfo = storage.getUserInfo()
    const mode = storage.getProjectMode()
    this.setData({
      userInfo,
      isLoggedIn: storage.isLoggedIn(),
      nickName: (userInfo && userInfo.nickName) || '',
      avatarUrl: (userInfo && userInfo.avatarUrl) || '',
      isNewUser: storage.isLoggedIn() ? this.data.isNewUser : false,
      focusNickInput: false,
      isEditing: false,
      projectMode: mode,
      switchChecked: mode === 'multi'
    })
  },

  // ============ 项目模式切换 ============
  onToggleProjectMode(e) {
    const newMode = e.detail.value ? 'multi' : 'single'
    const oldMode = storage.getProjectMode()

    // 先写入 storage，避免 selectData 回退导致视觉闪烁
    storage.setProjectMode(newMode)
    app.globalData.projectMode = newMode

    if (newMode === 'multi') {
      const result = storage.migrateToMultiMode()
      if (result.success) {
        wx.showToast({ title: '已切换到多项目模式', icon: 'success', duration: 1500 })
      }
    } else {
      const result = storage.migrateToSingleMode()
      if (result.success) {
        wx.showToast({ title: '已切换到单项目模式', icon: 'success', duration: 1500 })
      }
    }

    this.loadData()
  },

  // ============ 头像选择 ============
  onChooseAvatar(e) {
    const tempAvatarUrl = e.detail.avatarUrl
    if (!tempAvatarUrl) return

    wx.showLoading({ title: '上传头像...' })

    const cloudPath = 'avatars/' + Date.now() + '_' + Math.random().toString(36).substring(2, 8) + '.png'
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempAvatarUrl,
      success: async (uploadRes) => {
        wx.hideLoading()
        this.setData({ avatarUrl: uploadRes.fileID })
        const result = await sync.updateProfile({ avatarUrl: uploadRes.fileID })
        if (result.success) {
          this.setData({ isNewUser: false })
          wx.showToast({ title: '头像已更新', icon: 'success' })
        } else {
          wx.showToast({ title: result.error || '更新失败', icon: 'none' })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        wx.showToast({ title: '上传失败: ' + (err.errMsg || ''), icon: 'none', duration: 2500 })
      }
    })
  },

  // ============ 昵称修改 ============
  onNickNameInput(e) {
    this.setData({ nickName: e.detail.value, isEditing: true })
  },

  onNickNameConfirm(e) {
    const value = (e.detail.value || '').trim()
    if (!value) return
    this.setData({ nickName: value })
    this.saveNickName(value)
  },

  async onSaveProfile() {
    const nickName = (this.data.nickName || '').trim()
    if (!nickName) {
      wx.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }
    await this.saveNickName(nickName)
  },

  async saveNickName(nickName) {
    wx.showLoading({ title: '保存中...', mask: true })
    let result
    try {
      result = await sync.updateProfile({ nickName })
    } catch (_err) {
      result = { success: false, error: '网络异常' }
    }
    wx.hideLoading()
    if (result.success) {
      const userInfo = storage.getUserInfo() || {}
      userInfo.nickName = nickName
      storage.saveUserInfo(userInfo)
      this.setData({ nickName, isEditing: false })
      wx.showToast({ title: '保存成功', icon: 'success' })
      if (this.data.isNewUser) {
        this._savingProfile = true
        setTimeout(() => { wx.navigateBack() }, 800)
      }
    } else {
      wx.showToast({ title: result.error || '网络异常，请确保已登录', icon: 'none', duration: 2000 })
    }
  },

  // ============ 登录 ============
  onLogin() {
    wx.showLoading({ title: '登录中...' })
    sync.login().then(res => {
      wx.hideLoading()
      if (res.success) {
        this.loadData()
        if (!res.nickName) {
          this.setData({ isNewUser: true, focusNickInput: true })
        }
        wx.showToast({ title: '登录成功', icon: 'success' })
      } else {
        wx.showModal({
          title: '登录失败',
          content: res.error || '未知错误',
          showCancel: false
        })
      }
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '登录失败', icon: 'none' })
    })
  },

  // ============ 退出登录 ============
  onLogout() {
    wx.showModal({
      title: '提示',
      content: '退出登录后本地数据仍保留，重新登录可再次同步',
      success: (res) => {
        if (res.confirm) {
          storage.saveUserInfo(null)
          app.globalData.isLoggedIn = false
          app.globalData.userInfo = null
          this.loadData()
          wx.showToast({ title: '已退出', icon: 'success' })
        }
      }
    })
  },
})
