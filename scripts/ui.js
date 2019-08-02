const toastHtml = '<div class="toasty"></div>';
var schemaEditor;
var facetList;
var objectList;
var attributeList;
var forceGraph = ForceGraph();
var graphData = {
  nodes: [],
  links: []
}
const editorOptions = {
  maxLines: 50,
  mode: 'ace/mode/json',
  theme: 'ace/theme/tomorrow_night_bright'
};

function toast(msg, color = 'white', time) {
  console.log(msg)
  var toast = $(toastHtml);
  if (!time && color == 'red') time = 15000
  else time = 5000;
  toast
    .hide()
    .css('color', color)
    .text(msg)
    .appendTo('#toast')
    .fadeIn('slow')
    .delay(time)
    .fadeOut('slow')
  setTimeout(() => toast.remove(), time * 2);
};

function catchEnter(func) {
  return (e) => {
    if (e.keyCode == 13) {
      func(e.target.value);
      e.target.value = '';
    }
  }
}

function calcGraphDimensions() {
  forceGraph.width($(window).outerWidth() - $('#sidebar').outerWidth());
  forceGraph.height($(window).outerHeight() - $('#header').outerHeight());
}

function tabClick(tab) {
  $(`#tabs .${tab}`).addClass('active');
  $(`#tabs :not(.${tab})`).each((i, el) => $(el).removeClass('active'))
  $(`#sidebar section.${tab}`).each((i, el) => $(el).removeClass('hidden'))
  $(`#sidebar section:not(.${tab})`).each((i, el) => $(el).addClass('hidden'))
  if (tab == 'directory' && !(userDirectory && userDirectory.DirectoryArn))
    toast('No directory loaded. Apply a schema to initialize your directory', 'yellow');
  if (tab == 'config') getStore();
  $(window).resize();
};

function generateSchemaVersions(versions) {
  const existingVersions = $('#schema-versions select option').map(function() {
    return $(this).val();
  }).get();
  if (!versions.every(v => existingVersions.find(eV => v === eV))) {
    $('#schema-versions select').empty();
    for (v of versions) {
      const nsRegEx = new RegExp(`(${localConfig.namespace}.*)`);
      const shortName = v.split(nsRegEx)[1];
      const option = `<option value="${v}">${shortName}</option>`;
      $('#schema-versions select').append(option);
    };
    switchSchemaVersion();
  }
};

function generateObjectFacetNames() {
  $('#object-facet-select').empty();
  for (facet of userDirectory.Facets) {
    const option = `<option value="${facet.Name}">${facet.Name}</option>`;
    $('#object-facet-select').append(option);
  };
  switchSchemaVersion();
};

function onDirectoryChange() {
  if (userDirectory.Schemas[userDirectory.Schemas.Current].Minor[0]) {
    $('#schema-name input').val(`${localConfig.namespace}`);
    $('#schema-mode input').val(`${userDirectory.Schemas.Current.toUpperCase()}`);
    generateSchemaVersions(userDirectory.Schemas[userDirectory.Schemas.Current].Minor);
    $('.schema-dev-only').each((i, el) => $(el).prop('disabled', userDirectory.Schemas.Current != 'Development'));
    $('.schema-pub-only').each((i, el) => $(el).prop('disabled', userDirectory.Schemas.Current != 'Published'));
  }
  if (!userDirectory.DirectoryArn) $('section.directory').each((i, el) => $(el).addClass('disabled'))
  else $('section.directory').each((i, el) => $(el).removeClass('disabled'))
};

function setCommandEnabled(editor, name, enabled) {
  var command = editor.commands.byName[name]
  if (!command.bindKeyOriginal) command.bindKeyOriginal = command.bindKey;
  command.bindKey = enabled ? command.bindKeyOriginal : null;
  editor.commands.addCommand(command);
}

function escForTabOnEditor(editor) {
  editor.on('focus', () => {
    setCommandEnabled(editor, "indent", true)
    setCommandEnabled(editor, "outdent", true)
  })

  editor.commands.addCommand({
    name: "escape",
    bindKey: {win: "Esc", mac: "Esc"},
    exec: () => {
      setCommandEnabled(editor, "indent", false)
      setCommandEnabled(editor, "outdent", false)
    }
  });
}

function initForceGraph() {
  const nodeSize = 1
  forceGraph($('#graph')[0])
    .dagMode('td')
    .dagLevelDistance(150)
    .backgroundColor('#101020')
    .linkColor(() => 'rgba(255,255,255,0.2)')
    .linkLabel(l =>l.targetNode.path)
    .nodeRelSize(nodeSize)
    .nodeId('path')
    .nodeVal('size')
    .nodeLabel('path')
    .nodeAutoColorBy(n => n.level)
    .linkDirectionalParticles(l => l.targetNode.children)
    .linkDirectionalParticleWidth(5)
    .d3Force('collision',
      d3.forceCollide(10 * nodeSize)
      .iterations(5)
    )
    .d3Force('links',
      d3.forceLink()
      .iterations(5)
    )
    .d3Force('charge',
      d3.forceManyBody()
    )
    .d3VelocityDecay(0.1);

  $(window).resize(calcGraphDimensions);
};

function runImmediately() {
  checkConfig();
  if (window.location.hostname === 'rupertbg.github.io') {
    localConfig.google.aud = '441112355042-uc07t7cn3liql0d9i790bp29n3bjuias.apps.googleusercontent.com'
  }
  else if (!localConfig.google.aud) {
    localConfig.google.aud = prompt("What is the your Client ID for Google Sign In?");
    if (!localConfig.google.aud || !localConfig.google.aud.endsWith('.apps.googleusercontent.com')) {
      return alert("Invalid Client ID. Refresh to try again.");
    };
  }
  $('#google-client-id').attr('content', localConfig.google.aud);
};
runImmediately();

function onReady() {
  $('#object-name').on('keyup', catchEnter(createObject));
  $('#add-typed-link').on('keyup', catchEnter(addTypedLink));

  schemaEditor = ace.edit('schema-editor', editorOptions);
  schemaEditor.session.on('change', onDirectoryChange);
  escForTabOnEditor(schemaEditor);
  facetList = ace.edit('facet-list', editorOptions);
  escForTabOnEditor(facetList);
  objectList = ace.edit('object-list', editorOptions);
  escForTabOnEditor(objectList);
  typedList = ace.edit('typed-link-list', editorOptions);
  escForTabOnEditor(typedList);
  configEditor = ace.edit('config-editor', editorOptions);
  escForTabOnEditor(configEditor);

  initForceGraph();

  $(window).resize();
};

async function onSignIn(gUser) {
  if (!checkConfig()) setConfig();

  // Get Google info
  var profile = gUser.getBasicProfile();
  localConfig.namespace = profile.getId();
  toast('Google login complete');

  // Setup AWS
  AWS.config.region = localConfig.aws.region;
  AWS.config.credentials = new AWS.WebIdentityCredentials({
    RoleArn: localConfig.aws.role
  });
  AWS.config.credentials.params.WebIdentityToken = gUser.getAuthResponse().id_token;

  // Init AWS
  const sts = new AWS.STS();

  // Check identity
  var identity;
  try {
    identity = await sts.getCallerIdentity().promise();
    if (identity.Account) {
      toast('AWS connection established');
      initIde();
    }
  } catch (e) {
    toast('ERROR: AWS connection failed', 'red');
  };
};

async function startOver() {
  resetConfig();
  await googleSignOut();
  location.reload(true);
};

$(document).ready(onReady);
