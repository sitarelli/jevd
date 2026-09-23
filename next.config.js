/** @type {import('next').NextConfig} */
const nextConfig = {
  // I link proposti da Jev restano nella forma /scheda-cadute?source=jev
  async rewrites() {
    return [{ source: '/scheda-:tipo', destination: '/scheda/:tipo' }];
  },
};
module.exports = nextConfig;
