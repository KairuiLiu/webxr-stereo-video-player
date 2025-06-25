// vite.config.js
import basicSsl from '@vitejs/plugin-basic-ssl'

export default {
  plugins: [
    basicSsl({
      name: 'test',
      domains: ['*'],
      certDir: '.devServer/cert',
    }),
  ],
}
