function deleteNullAttributes(obj) {
  for (var attr in obj) {
    if (obj[attr] === null) delete obj[attr]
    else if (typeof obj[attr] === 'object') deleteNullAttributes(obj[attr])
  }
  return obj;
}
