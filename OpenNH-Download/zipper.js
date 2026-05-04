
class Zipper {
  constructor() {
    this._files = [];
  }

  
  addFile(name, data) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    this._files.push({ name, nameBytes, data, crc });
  }

 
  generate() {
    const parts = [];
    const centralDir = [];
    let offset = 0;

    const now = dosDatetime();

    for (const file of this._files) {
      // ─── Local file header ───
      const lh = localFileHeader(file, now);
      parts.push(lh);
      centralDir.push({ file, offset, now });
      offset += lh.length + file.data.length;
      parts.push(file.data);
    }

  
    const cdStart = offset;
    for (const { file, offset: localOffset, now } of centralDir) {
      const cd = centralDirHeader(file, localOffset, now);
      parts.push(cd);
      offset += cd.length;
    }

    
    const cdSize = offset - cdStart;
    const eocd = endOfCentralDir(centralDir.length, cdSize, cdStart);
    parts.push(eocd);

    
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) { out.set(p, pos); pos += p.length; }
    return out;
  }
}



function dosDatetime() {
  const d = new Date();
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { date: dosDate, time: dosTime };
}

function localFileHeader(file, dt) {
  const buf = new ArrayBuffer(30 + file.nameBytes.length);
  const v = new DataView(buf);
  const u = new Uint8Array(buf);
  let o = 0;

  v.setUint32(o, 0x04034b50, true); o += 4; // signature PK\x03\x04
  v.setUint16(o, 20, true);          o += 2; // version needed (2.0)
  v.setUint16(o, 0, true);           o += 2; // flags
  v.setUint16(o, 0, true);           o += 2; // compression (0 = store)
  v.setUint16(o, dt.time, true);     o += 2;
  v.setUint16(o, dt.date, true);     o += 2;
  v.setUint32(o, file.crc, true);    o += 4;
  v.setUint32(o, file.data.length, true); o += 4; // compressed size
  v.setUint32(o, file.data.length, true); o += 4; // uncompressed size
  v.setUint16(o, file.nameBytes.length, true); o += 2;
  v.setUint16(o, 0, true);           o += 2; // extra field length
  u.set(file.nameBytes, o);
  return u;
}

function centralDirHeader(file, localOffset, dt) {
  const buf = new ArrayBuffer(46 + file.nameBytes.length);
  const v = new DataView(buf);
  const u = new Uint8Array(buf);
  let o = 0;

  v.setUint32(o, 0x02014b50, true);  o += 4; // signature PK\x01\x02
  v.setUint16(o, 20, true);          o += 2; // version made by
  v.setUint16(o, 20, true);          o += 2; // version needed
  v.setUint16(o, 0, true);           o += 2; // flags
  v.setUint16(o, 0, true);           o += 2; // compression
  v.setUint16(o, dt.time, true);     o += 2;
  v.setUint16(o, dt.date, true);     o += 2;
  v.setUint32(o, file.crc, true);    o += 4;
  v.setUint32(o, file.data.length, true); o += 4;
  v.setUint32(o, file.data.length, true); o += 4;
  v.setUint16(o, file.nameBytes.length, true); o += 2;
  v.setUint16(o, 0, true);           o += 2; // extra length
  v.setUint16(o, 0, true);           o += 2; // comment length
  v.setUint16(o, 0, true);           o += 2; // disk number start
  v.setUint16(o, 0, true);           o += 2; // internal attrs
  v.setUint32(o, 0, true);           o += 4; // external attrs
  v.setUint32(o, localOffset, true); o += 4; // local header offset
  u.set(file.nameBytes, o);
  return u;
}

function endOfCentralDir(count, cdSize, cdOffset) {
  const buf = new ArrayBuffer(22);
  const v = new DataView(buf);
  let o = 0;

  v.setUint32(o, 0x06054b50, true); o += 4; // signature PK\x05\x06
  v.setUint16(o, 0, true);          o += 2; // disk number
  v.setUint16(o, 0, true);          o += 2; // disk with start of CD
  v.setUint16(o, count, true);      o += 2; // entries on this disk
  v.setUint16(o, count, true);      o += 2; // total entries
  v.setUint32(o, cdSize, true);     o += 4; // central dir size
  v.setUint32(o, cdOffset, true);   o += 4; // central dir offset
  v.setUint16(o, 0, true);                   // comment length
  return new Uint8Array(buf);
}

// CRC-32 table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
