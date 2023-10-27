function logCallExpression (node) {
  let str = ''
  let expr = node.expression
  if (expr.type !== 'CallExpression') return

  while (expr) {
    str += ' -'
    if (expr.type === 'CallExpression') {
      str += ` ${expr.type}:`
      if (expr.callee.type === 'Identifier') {
        str += ` ${expr.callee.name}`
      } else {
        str += ` ${expr.callee.property.name}`
      }
      expr = expr.callee.object
    } else if (expr.type === 'Identifier') {
      str += ` ${expr.type}: ${expr.name}`
      break
    } else {
      str += ` ${expr.type}`
      break
    }
  }
  console.log(str)
}

module.exports = {
  logCallExpression
}
