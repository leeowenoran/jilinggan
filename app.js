// app.js
App({
  onLaunch() {
    // 初始化云开发
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-d7g9wbsbd8be82c80',
        traceUser: true
      })
    }

    // 从本地恢复登录状态
    const storage = require('./utils/storage')
    const userInfo = storage.getUserInfo()
    if (userInfo && userInfo.isLoggedIn) {
      this.globalData.isLoggedIn = true
      this.globalData.userInfo = userInfo
    }

    this.globalData.projectMode = storage.getProjectMode()
  },

  globalData: {
    // 用户状态
    isLoggedIn: false,
    userInfo: null,

    // 草稿续写
    draftContent: '',
    lastDraftSave: 0,

    // 云开发
    cloudEnv: 'cloud1-d7g9wbsbd8be82c80',
    cloudAvailable: true,

    // 项目模式
    projectMode: 'single'
  }
})
