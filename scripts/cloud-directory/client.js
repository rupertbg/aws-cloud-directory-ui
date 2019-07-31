const MaxResults = 25;

async function clouddirectory(method, params={}) {
  const cd = new AWS.CloudDirectory({
    apiVersion: '2017-01-11'
  });
  var results = [];
  try {
    var resp = await cd[method](params).promise();
    var next = resp.NextToken;
    delete resp.NextToken;
    results.push(resp);
    while (next) {
      resp = await cd[method](Object.assign(params, { NextToken: resp.NextToken, MaxResults })).promise();
      next = resp.NextToken;
      delete resp.NextToken;
      results.push(resp);
    }
  } catch (e) {
    throw e;
  };
  return results.length > 1 ? results : results[0];
}
