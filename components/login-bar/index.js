// components/login-bar/index.js
Component({
  properties: {},

  data: {
    visible: true
  },

  methods: {
    onLogin() {
      this.triggerEvent('login')
    },

    onDismiss() {
      this.setData({ visible: false })
      this.triggerEvent('dismiss')
    }
  }
})
