// Génère une empreinte stable de la machine pour distinguer les ordinateurs
// d'un même utilisateur. Utilisé pour détecter une "nouvelle machine" lors
// du démarrage et déclencher une synchro cloud→local explicite.
//
// Stratégie :
//   1) hostname + premier MAC physique (non virtuel, non loopback)
//   2) Si MAC indisponible : UUID aléatoire stocké en electron-store (créé une
//      seule fois par installation et persiste entre redémarrages)
//   3) Hash SHA-256 → 24 caractères hex pour rester compact mais collision-safe
//
// Aucune dépendance externe : utilise os + crypto (Node natif).

const os = require('os');
const crypto = require('crypto');
const Store = require('electron-store');

const store = new Store({ name: 'machine-id' });

const VIRTUAL_MAC_PATTERNS = [
    /^00:00:00/i,
    /^00:50:56/i, // VMware
    /^00:1c:42/i, // Parallels
    /^00:0c:29/i, // VMware
    /^00:05:69/i, // VMware
    /^08:00:27/i, // VirtualBox
    /^0a:00:27/i, // VirtualBox
    /^52:54:00/i, // QEMU/KVM
];

function isUsableMac(addr) {
    if (!addr || addr === '00:00:00:00:00:00') return false;
    return !VIRTUAL_MAC_PATTERNS.some((p) => p.test(addr));
}

function getFirstPhysicalMac() {
    try {
        const interfaces = os.networkInterfaces();
        // Priorité aux interfaces avec un nom qui ressemble à du physique
        const preferredOrder = ['Ethernet', 'Wi-Fi', 'wlan0', 'eth0', 'en0', 'en1'];
        const allNames = Object.keys(interfaces);
        const ordered = [
            ...preferredOrder.filter((n) => allNames.some((a) => a.toLowerCase().includes(n.toLowerCase()))),
            ...allNames,
        ];
        const seen = new Set();
        for (const name of ordered) {
            if (seen.has(name)) continue;
            seen.add(name);
            const addrs = interfaces[name] || [];
            for (const a of addrs) {
                if (!a.internal && isUsableMac(a.mac)) {
                    return { mac: a.mac, iface: name };
                }
            }
        }
    } catch (_e) { /* ignore */ }
    return null;
}

function getOrCreateFallbackUuid() {
    let uuid = store.get('fallbackUuid');
    if (!uuid) {
        uuid = crypto.randomBytes(16).toString('hex');
        store.set('fallbackUuid', uuid);
    }
    return uuid;
}

function getMachineId() {
    const hostname = os.hostname() || 'unknown-host';
    const macInfo = getFirstPhysicalMac();
    const macPart = macInfo ? macInfo.mac : `noMac:${getOrCreateFallbackUuid()}`;
    const raw = `${hostname}|${macPart}`;
    const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
    return {
        machineId: hash,
        label: hostname,
        usedFallback: !macInfo,
    };
}

module.exports = { getMachineId };
