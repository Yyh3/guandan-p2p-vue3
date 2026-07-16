/**
 * network-mdns.js — Capacitor 原生 mDNS/Bonjour 服务发现
 *
 * 仅在本机原生环境(Capacitor Android/iOS)启用;浏览器/Node 环境自动降级为 no-op,
 * 不影响现有 HTTP/WebSocket 扫描逻辑。
 */
import { Capacitor } from '@capacitor/core'

const SERVICE_TYPE = '_guandan._tcp.'
const DOMAIN = 'local.'
const PROP_ROOM_NO = 'roomNo'

let ZeroConf = null
let pluginPromise = null

async function loadPlugin() {
  if (ZeroConf) return ZeroConf
  if (!Capacitor.isNativePlatform()) return null
  if (pluginPromise) return pluginPromise
  pluginPromise = import('capacitor-zeroconf')
    .then((mod) => {
      ZeroConf = mod?.ZeroConf || null
      return ZeroConf
    })
    .catch(() => null)
  return pluginPromise
}

/** 当前平台是否支持原生 mDNS */
export function isMdnsAvailable() {
  return Capacitor.isNativePlatform()
}

/**
 * 注册本机为 mDNS 服务(host 端调用)
 * @param {{name:string, port:number, roomNo:string}} params
 * @returns {Promise<{ok:boolean, error?:string, stop?:()=>Promise<void>}>}
 */
export async function registerMdnsService({ name, port, roomNo }) {
  const z = await loadPlugin()
  if (!z) return { ok: false, error: 'not_native' }
  try {
    await z.register({
      type: SERVICE_TYPE,
      domain: DOMAIN,
      name,
      port,
      props: { [PROP_ROOM_NO]: String(roomNo) },
    })
    return {
      ok: true,
      stop: async () => {
        try { await z.unregister({ type: SERVICE_TYPE, domain: DOMAIN, name }) } catch (_) {}
      },
    }
  } catch (e) {
    return { ok: false, error: e?.message || 'register_failed' }
  }
}

/**
 * 监听局域网内 mDNS 服务(joiner 端扫描调用)
 * @param {(service:{ip:string, port:number, roomNo:string, name:string, hostname:string})=>void} onService
 * @returns {Promise<{stop:()=>Promise<void>}>}
 */
export async function watchMdnsServices(onService) {
  const z = await loadPlugin()
  if (!z) return { stop: async () => {} }
  const request = { type: SERVICE_TYPE, domain: DOMAIN }
  const cb = (result) => {
    const svc = result?.service
    if (!svc || result?.action === 'removed') return
    const ip = svc.ipv4Addresses?.[0] || svc.ipv6Addresses?.[0]
    if (!ip) return
    onService({
      ip,
      port: svc.port,
      roomNo: svc.txtRecord?.[PROP_ROOM_NO] || '',
      name: svc.name,
      hostname: svc.hostname,
    })
  }
  try {
    await z.watch(request, cb)
    return {
      stop: async () => {
        try { await z.unwatch(request) } catch (_) {}
      },
    }
  } catch (e) {
    return { stop: async () => {} }
  }
}

/** 停止所有 mDNS 监听/发布 */
export async function stopMdns() {
  const z = await loadPlugin()
  if (!z) return
  try { await z.stop() } catch (_) {}
}
