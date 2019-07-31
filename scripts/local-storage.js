const store = window.localStorage;

const initialConfig = {
  namespace: null,
  directory: {},
  aws: {
    role: null,
    region: null,
    accountId: null
  },
  google: {
    aud: null
  }
};

var localConfig = JSON.parse(JSON.stringify(initialConfig));

function checkConfig() {
  var storedConfig;
  try {
      storedConfig = JSON.parse(store.getItem('config'))
  } catch (e) {
    const msg = 'Stored config was invalid';
    console.warn(msg); toast(msg, 'yellow');
  } finally {
    if (!storedConfig) storedConfig = {};
    for (var attr in localConfig.aws) {
      if (!storedConfig.aws[attr]) return false;
    }
    for (var attr in localConfig.google) {
      if (!storedConfig.google[attr]) return false;
    }
  }
  localConfig = storedConfig;
  return true;
}

async function googleSignOut() {
  var auth2 = gapi.auth2.getAuthInstance();
  await auth2.signOut();
}

function setConfig() {
  checkConfig();
  if (!localConfig.aws.role) {
    localConfig.aws.role = prompt("What is the ARN of the role you have deployed in your AWS account?");
    if (!localConfig.aws.role || !(localConfig.aws.role.startsWith('arn:') && localConfig.aws.role.includes('role/'))) {
      throw alert("Invalid Role ARN. Refresh to try again.");
    };
  }

  if (!localConfig.aws.region) {
    localConfig.aws.region = prompt("Which AWS region would you like to use?");
    if (!(localConfig.aws.region && localConfig.aws.region.match(/[a-z]+-[a-z]+-[0-3]/))) {
      throw alert("Invalid region. Refresh to try again.");
    };
  }

  const roleArnSplit = localConfig.aws.role.split(':');
  localConfig.aws.accountId = roleArnSplit[4];
  saveConfig();
}

function resetConfig() {
  localConfig = JSON.parse(JSON.stringify(initialConfig));
  console.log(localConfig)
  store.setItem('config', JSON.stringify(localConfig));
  toast('Configuration reset');
}

function saveConfig() {
  store.setItem('config', JSON.stringify(localConfig));
  toast('Configuration saved');
}
$(window).on("beforeunload", saveConfig);

function getStore() {
  configEditor.setValue('');
  var serializedStore = Object.assign({}, store);
  for (var item in serializedStore) {
    serializedStore[item] = JSON.parse(serializedStore[item]);
  };
  configEditor.setValue(JSON.stringify(serializedStore, null, 2));
  configEditor.clearSelection();
  toast('Retrieved contents of local storage', 'lightgreen');
}

function putStore() {
  const serializedStore = Object.assign({}, store);
  const editorContents = JSON.parse(configEditor.getValue());
  for (var item in editorContents) {
    store.setItem(item, JSON.stringify(editorContents[item]));
  };
  for (var item in serializedStore) {
    if (!Object.keys(editorContents).includes(item)) store.removeItem(item);
  };
  toast('Set contents to local storage', 'lightgreen');
}
