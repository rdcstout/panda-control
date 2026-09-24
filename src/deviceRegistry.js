function sameStableDevice(left, right) {
  return Boolean(left?.hardwareId && right?.hardwareId && left.hardwareId === right.hardwareId);
}

function sameAddress(left, right) {
  return Boolean(left?.ip && right?.ip && left.ip === right.ip);
}

export function deviceIdentityMatches(known, device) {
  return known.id === device.id
    || sameStableDevice(known, device)
    || sameAddress(known, device);
}

export function isKnownDevice(knownDevices, device) {
  return knownDevices.some(known => deviceIdentityMatches(known, device));
}

export function reconcileDevices(currentDevices, incomingDevices) {
  const next = [...currentDevices];
  const incomingByProduct = new Map();
  const currentByProduct = new Map();

  for (const device of incomingDevices) {
    const entries = incomingByProduct.get(device.product) || [];
    entries.push(device);
    incomingByProduct.set(device.product, entries);
  }
  for (const device of currentDevices) {
    const entries = currentByProduct.get(device.product) || [];
    entries.push(device);
    currentByProduct.set(device.product, entries);
  }

  for (const incoming of incomingDevices) {
    let index = next.findIndex(existing => existing.id === incoming.id || sameStableDevice(existing, incoming));
    if (index < 0) index = next.findIndex(existing => sameAddress(existing, incoming));

    if (index < 0) {
      const legacy = currentByProduct.get(incoming.product) || [];
      const discovered = incomingByProduct.get(incoming.product) || [];
      if (legacy.length === 1 && discovered.length === 1 && !legacy[0].hardwareId) {
        index = next.findIndex(existing => existing.id === legacy[0].id);
      }
    }

    if (index < 0) {
      next.push(incoming);
      continue;
    }

    const previous = next[index];
    const merged = { ...previous, ...incoming, id: previous.id };
    next[index] = merged;
  }

  return { devices: next };
}
