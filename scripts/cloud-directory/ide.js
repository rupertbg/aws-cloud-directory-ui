const managedSchemaARN = 'arn:aws:clouddirectory:::schema/managed/quick_start/1.0/001';
var userDirectory = localConfig.directory;

async function initIde() {
  toast('Initializing Cloud Directory IDE', 'lightblue', 10000);
  var directoryName = localConfig.namespace;
  var directoryList = await clouddirectory('listDirectories');
  var existingDirectories = directoryList
    .Directories
    .filter(d => d.State != "DELETED");
  const existingDirectory = existingDirectories.find(d => d.Name == directoryName);
  if (existingDirectory) userDirectory = existingDirectory;
  await initSchema();
  await findExistingDirectory();
}

async function initSchema() {
  const directoryName = localConfig.namespace;
  toast('Initializing development schema');
  toast('Downloading Quick Start schema');
  const quickStartSchema = await clouddirectory('getSchemaAsJson', {
    SchemaArn: managedSchemaARN
  });
  if (!(quickStartSchema && quickStartSchema.Document)) throw toast('Error downloading Quick Start schema', 'red');

  var schemaDoc = quickStartSchema.Document;
  schemaDoc = deleteNullAttributes(JSON.parse(schemaDoc))

  toast('Listing existing schemas');
  const listSchemas = await clouddirectory('listDevelopmentSchemaArns');
  var schemaArn = `arn:aws:clouddirectory:${localConfig.aws.region}:${localConfig.aws.accountId}:schema/development/${directoryName}`;
  const schemaExists = listSchemas.SchemaArns.includes(schemaArn);

  if (!userDirectory.Schemas) userDirectory.Schemas = {
    Current: 'Development',
    Development: {
      Major: [],
      Minor: [],
      Latest: {}
    },
    Published: {
      Major: [],
      Minor: [],
      Latest: {}
    },
    Applied: {
      Major: [],
      Minor: [],
      Latest: {}
    }
  };
  if (!schemaExists) {
    toast('Creating new base development schema', 'yellow');
    const newSchema = await clouddirectory('createSchema', {
      Name: directoryName
    });
    if (!(newSchema && newSchema.SchemaArn)) throw toast('Error creating new schema', 'red');

    toast('Uploading base schema');
    const putSchema = await clouddirectory('putSchemaFromJson', {
      Document: JSON.stringify(schemaDoc),
      SchemaArn: newSchema.SchemaArn
    });

    toast(`Created new development schema: ${newSchema.SchemaArn}`, 'lightgreen');
  }
  else {
    toast('Schema found', 'lightgreen');
    await getPublishedSchemaVersions();
    await getAppliedSchemaVersions();
  }

  userDirectory.Schemas.Development.Major = [schemaArn]
  userDirectory.Schemas.Development.Minor = [schemaArn]
  userDirectory.Schemas.Development.Latest.Major = schemaArn
  userDirectory.Schemas.Development.Latest.Minor = schemaArn

  await getSchema();
}

async function getPublishedSchemaVersions() {
  try {
    const listPublishedMajor = await clouddirectory('listPublishedSchemaArns');
    if (listPublishedMajor.SchemaArns.length) {
      userDirectory.Schemas.Published.Major = listPublishedMajor.SchemaArns;
      userDirectory.Schemas.Published.Latest.Major = listPublishedMajor.SchemaArns[listPublishedMajor.SchemaArns.length - 1];
    }
    else {
      userDirectory.Schemas.Published.Major = [];
      userDirectory.Schemas.Published.Latest.Major = undefined;
    }

    const listPublishedMinor = await clouddirectory('listPublishedSchemaArns', {
      SchemaArn: userDirectory.Schemas.Published.Latest.Major
    });
    if (listPublishedMinor.SchemaArns.length) {
      userDirectory.Schemas.Published.Minor = listPublishedMinor.SchemaArns;
      userDirectory.Schemas.Published.Latest.Minor = listPublishedMinor.SchemaArns[listPublishedMinor.SchemaArns.length - 1];
    }
    else {
      userDirectory.Schemas.Published.Minor = [];
      userDirectory.Schemas.Published.Latest.Minor = undefined;
    }
  } catch (e) {
    console.warn(e);
  }
}

async function getAppliedSchemaVersions() {
  try {
    var schemasMajorVersions = await clouddirectory('listAppliedSchemaArns', {
      DirectoryArn: userDirectory.DirectoryArn
    });
    userDirectory.Schemas.Applied.Major = schemasMajorVersions.SchemaArns;
    userDirectory.Schemas.Applied.Latest.Major = schemasMajorVersions.SchemaArns[schemasMajorVersions.SchemaArns.length - 1];

    var schemaMinorVersions = await clouddirectory('listAppliedSchemaArns', {
      DirectoryArn: userDirectory.DirectoryArn,
      SchemaArn: schemasMajorVersions.SchemaArns[0]
    });
    userDirectory.Schemas.Applied.Minor = schemaMinorVersions.SchemaArns;
    userDirectory.Schemas.Applied.Latest.Minor = schemaMinorVersions.SchemaArns[schemaMinorVersions.SchemaArns.length - 1];
  } catch (e) {
    console.warn(e);
  }
}

async function createDirectory(publishedSchemaArn) {
  const directoryName = localConfig.namespace;
  toast('Creating new directory');
  const newDirectory = await clouddirectory('createDirectory', {
    Name: directoryName,
    SchemaArn: publishedSchemaArn
  });
  if (!(newDirectory && newDirectory.DirectoryArn)) throw toast('Error creating directory', 'red');
  userDirectory = Object.assign(userDirectory, newDirectory);
  toast('Created new directory', 'yellow');
  return newDirectory;
}

async function findExistingDirectory() {
  if (!(userDirectory && userDirectory.DirectoryArn)) toast('Existing directory not found', 'yellow')
  else {
     toast('Discovered Cloud Directory', 'lightgreen');

     var childs = await clouddirectory('listObjectChildren', {
       DirectoryArn: userDirectory.DirectoryArn,
       ObjectReference: {
         Selector: '/'
       }
     });
     userDirectory.Children = childs;
     userDirectory.Id = userDirectory.DirectoryArn.split('directory/')[1];
     userDirectory.DefinitionSchema = `arn:aws:clouddirectory:${localConfig.aws.region}:${localConfig.aws.accountId}:directory/${userDirectory.Id}/schema/CloudDirectory/1.0`;
     toast('Retrieved schema details');

     await getSchema();
     await listObjects();
     await listFacets();
     await updateGraphData();
   };
}

async function getSchema() {
  schemaEditor.setValue('');
  if (
      !userDirectory.Schemas[userDirectory.Schemas.Current]
      || !userDirectory.Schemas[userDirectory.Schemas.Current].Latest.Minor
    ) {
    toast(`No ${userDirectory.Schemas.Current} schema available`, 'yellow');
    switchSchema('Development');
  }
  else {
    const selectedSchema = userDirectory.Schemas.Selected
      || userDirectory.Schemas[userDirectory.Schemas.Current].Latest.Minor;
    console.warn(selectedSchema);
    try {
      const schemaJson = await clouddirectory('getSchemaAsJson', {
        SchemaArn: selectedSchema
      });

      if (!(schemaJson && schemaJson.Document)) throw 'Invalid response'
      toast(`Retrieved schema: ${selectedSchema}`, 'lightgreen');
      schemaEditor.setValue(JSON.stringify(JSON.parse(schemaJson.Document), null, 2));
      schemaEditor.clearSelection();
    }
    catch (e) {
      console.error(e);
      toast('Error retrieving schema content', 'red');
    }
  };
}

async function putSchema() {
  try {
    const schemaJson = await clouddirectory('putSchemaFromJson', {
      SchemaArn: userDirectory.Schemas[userDirectory.Schemas.Current].Latest.Minor,
      Document: schemaEditor.getValue()
    });

    if (!(schemaJson && schemaJson.Arn)) throw 'Invalid response'
    toast('Updated schema content', 'lightgreen');
    schemaEditor.clearSelection();
    await getSchema();
  }
  catch (e) {
    console.error(e);
    toast('Error uploading schema content', 'red');
    toast(e, 'red');
  }
}

function generateMinorVersion() {
  var id = '';
  while (id.length < 10) {
    id += Math.random()
      .toString(36)
      .replace(/\.|\s\S/g,'')
      .substring(0, 10 - id.length);
  };
  return id;
}

async function publishSchema(majorVersion, minorVersion) {
  try {
    const existingSchema = userDirectory.Schemas.Published.Latest.Minor;
    var publishedSchema;
    var publishedSchemaArn;
    if (existingSchema) {
      publishedSchema = await clouddirectory('upgradePublishedSchema', {
        DevelopmentSchemaArn: userDirectory.Schemas['Development'].Latest.Major,
        PublishedSchemaArn: existingSchema,
        MinorVersion: minorVersion || generateMinorVersion(),
      });

      if (!(publishedSchema && publishedSchema.UpgradedSchemaArn)) throw 'Invalid response';
      toast(`Published schema: ${publishedSchema.UpgradedSchemaArn}`, 'lightgreen');
      publishedSchemaArn = publishedSchema.UpgradedSchemaArn;
    }
    else {
      publishedSchema = await clouddirectory('publishSchema', {
        DevelopmentSchemaArn: userDirectory.Schemas['Development'].Latest.Major,
        Version: majorVersion || '1',
        MinorVersion: minorVersion || generateMinorVersion(),
      });

      if (!(publishedSchema && publishedSchema.PublishedSchemaArn)) throw 'Invalid response';
      toast(`Published schema: ${publishedSchema.PublishedSchemaArn}`, 'lightgreen');
      publishedSchemaArn = publishedSchema.PublishedSchemaArn;
    }

    await getPublishedSchemaVersions();
    schemaEditor.clearSelection();
    switchSchema('Published');
  }
  catch (e) {
    console.error(e);
    toast('Error uploading schema content', 'red');
    toast(e, 'red');
  }
}

async function applySchema() {
  try {
    if (userDirectory.Schemas.Published.Latest.Minor) {
      const schemaArn = userDirectory.Schemas.Published.Latest.Minor;
      var appliedSchema;
      if (!userDirectory.DirectoryArn) appliedSchema = await createDirectory(schemaArn);
      else {
        appliedSchema = await clouddirectory('applySchema', {
          DirectoryArn: userDirectory.DirectoryArn,
          PublishedSchemaArn: schemaArn
        });

        if (!(appliedSchema && appliedSchema.AppliedSchemaArn)) throw 'Invalid response';
      }
      toast(`Applied schema: ${appliedSchema.AppliedSchemaArn}`, 'lightgreen');
      await getAppliedSchemaVersions();
      schemaEditor.clearSelection();
      switchSchema('Applied');
    }
    else toast(`No published schema available to apply`, 'yellow');
  }
  catch (e) {
    console.error(e);
    toast('Error uploading schema content', 'red');
    toast(e, 'red');
  }
}

async function switchSchema(newState) {
  if (newState) {
    userDirectory.Schemas.Current = newState;
    $('#schema-mode select').val(newState);
  }
  else userDirectory.Schemas.Current = $('#schema-mode select option:selected').val();
  await getSchema();
}

async function switchSchemaVersion() {
  const currentVersion = userDirectory.Schemas.Selected;
  userDirectory.Schemas.Selected = $('#schema-versions select option:selected').val();
  if (currentVersion !== userDirectory.Schemas.Selected) await getSchema();
}

async function deleteSchemaVersion() {
  if (userDirectory.Schemas.Current != 'Published')
    return toast('Only published schema versions can be deleted', 'yellow');
  try {
    const arn = userDirectory.Schemas.Selected;
    const deleted = await clouddirectory('deleteSchema', {
      SchemaArn: arn
    });
    toast(`Deleted ${arn}`, 'lightgreen');

    await getPublishedSchemaVersions();
    if (!userDirectory.Schemas.Published.Minor.length) switchSchema('Development')
    else await getSchema();
  }
  catch (e) {
    console.error(e);
    toast('Error deleting schema', 'red');
  }
}

async function listFacets() {
  facetList.setValue('');
  var facets = []
  try {
    const schemaArn = userDirectory.Schemas[userDirectory.Schemas.Current].Latest.Minor;
    const listNames = await clouddirectory('listFacetNames', {
      SchemaArn: schemaArn
    });
    toast('Retrieved facets', 'lightgreen');

    for (var facet of listNames.FacetNames) {
      var resp = await clouddirectory('getFacet', {
        Name: facet,
        SchemaArn: schemaArn
      });
      const facetAttrs = await clouddirectory('listFacetAttributes', {
        Name: facet,
        SchemaArn: schemaArn
      });
      resp.Facet = Object.assign(resp.Facet, facetAttrs);
      facets.push(resp.Facet);
    };
    facetList.setValue(JSON.stringify(facets, null, 2));
    facetList.clearSelection();
    userDirectory.Facets = facets;
  }
  catch (e) {
    console.error(e);
    toast('Error retrieving facets', 'red');
  }
}

async function putFacets() {
  try {
    const facetEditorValue = facetList.getValue();
    const facets = JSON.parse(facetEditorValue);
    const existingFacets = userDirectory.Facets;
    for (facet of facets) {
      const exists = await facetExists(facet.Name);
      if (exists) await updateFacet(facet)
      else await createFacet(facet);
    }
    for (facet of existingFacets) {
      const missing = !facets.find(x => x.Name === facet.Name);
      if (missing) await deleteFacet(facet.Name);
    }
    await listFacets();
  } catch (e) {
    toast(`Error parsing facets`, 'red');
    console.error(e);
    toast(e, 'red');
  }
}

async function facetExists(name) {
  try {
    let facet = await clouddirectory('getFacet', {
      Name: name,
      SchemaArn: userDirectory.Schemas[userDirectory.Schemas.Current].Latest.Minor
    });
    if (facet.Facet) return true;
  }
  catch (e) {
    if (e && e.code !== "FacetNotFoundException") console.error(e);
  }
  return false;
}

async function createFacet(params) {
  if (!params.SchemaArn) params.SchemaArn = userDirectory.Schemas[userDirectory.Schemas.Current].Latest.Minor
  try {
    await clouddirectory('createFacet', params);
    toast(`Created Facet: ${params.Name}`, 'lightgreen');
  }
  catch (e) {
    console.error(e);
    toast(`Error creating Facet: ${params.Name}`, 'red');
    toast(e, 'red');
  }
}

async function updateFacet(params) {
  try {
    if (!params || !params.Name) throw 'Missing Facet parameters';
    if (!params.SchemaArn) params.SchemaArn = userDirectory.Schemas[userDirectory.Schemas.Current].Latest.Minor
    if (params.FacetStyle) delete params.FacetStyle;
    params.AttributeUpdates = [];
    if (params.Attributes) params.AttributeUpdates = await generateFacetAttributeUpdates(params.Name, params.Attributes)
    delete params.Attributes;
    if (params.AttributeUpdates.length) {
      await clouddirectory('updateFacet', params);
      toast(`Updated Facet: ${params.Name}`, 'lightgreen');
    }
    else toast(`No changes to facet: ${params.Name}`);
  }
  catch (e) {
    console.error(e);
    toast(`Error updating Facet: ${params.Name}`, 'red');
    toast(e, 'red');
  }
}

async function deleteFacet(name) {
  try {
    const schemaArn =  userDirectory.Schemas[userDirectory.Schemas.Current].Latest.Major;
    await clouddirectory('deleteFacet', {
      Name: name,
      SchemaArn: userDirectory.Schemas.Latest.Minor
    });
    toast(`Deleted Facet: ${name}`, 'lightgreen');
  }
  catch (e) {
    console.error(e);
    toast(`Error deleting Facet: ${name}`, 'red');
    toast(e, 'red');
  }
}

async function listAllFacetsAttributes() {
  var facetAttributes = {};
  facetList.setValue('');
  try {
    for (var facet of Object.keys(userDirectory.Facets)) {
      const attributes = await listFacetAttributes(facet);
      facetAttributes[facet] = attributes;
      userDirectory.Facets[facet].Attributes = attributes;
    }
    toast('Retrieved facet attributes', 'lightgreen');
    facetList.setValue(JSON.stringify(facetAttributes, null, 2));
    facetList.clearSelection();
  }
  catch (e) {
    console.error(e);
    toast('Error retrieving facet attributes', 'red');
  }
}

async function listFacetAttributes(name) {
  try {
    const schemaArn = userDirectory.Schemas[userDirectory.Schemas.Current].Latest.Major;
    toast(`Retrieving attributes of ${name}`);
    var result = await clouddirectory('listFacetAttributes', {
      Name: name,
      SchemaArn: schemaArn,
    });
    return result.Attributes;
  }
  catch (e) {
    console.error(e);
    toast('Error retrieving facet attributes', 'red');
  }
}

async function generateFacetAttributeUpdates(facetName, attrs) {
  const exAttrs = await listFacetAttributes(facetName);
  const updates = [];
  for (var attr in attrs) {
    const exists = exAttrs.find(x => x.Name === attr.Name);
    if (JSON.stringify(exists) !== JSON.stringify(attr)) {
      var update = {
        Action: 'CREATE_OR_UPDATE',
        Attribute: attr
      };
      updates.push(update);
    };
  }
  for (var exAttr in exAttrs) {
    var update = {
      Action: 'DELETE',
      Attribute: exAttr
    };
    const existsInNew = attrs.find(x => x.Name === exAttr.Name);
    if (!existsInNew) updates.push(update);
  };
  return updates;
};

async function listObjects() {
  var dir = {
    Name: "Root",
    Path: "/",
    Children: []
  }
  objectList.setValue('');
  try {
    const resp = await clouddirectory('listObjectChildren', {
      DirectoryArn: userDirectory.DirectoryArn,
      ObjectReference: {
        Selector: '/'
      }
    });
    toast('Retrieved children of /', 'lightgreen');
    dir.Children.concat(resp.Children);
    objectList.setValue(JSON.stringify(dir, null, 2));
    objectList.clearSelection();
    return dir;
  }
  catch (e) {
    console.error(e);
    toast('Error retrieving nodes', 'red');
  }
}

async function createObject(name, link = $('#object-link').val(), parent = $('#object-parent').val()) {
  try {
    const schemaArn =  userDirectory.Schemas[userDirectory.Schemas.Current].Latest.Major;
    await clouddirectory('createObject', {
      DirectoryArn: userDirectory.DirectoryArn,
      SchemaFacets: [{
        FacetName: 'DynamicObjectFacet',
        SchemaArn: schemaArn
      }],
      ObjectAttributeList: [{
        Key: {
          FacetName: 'DynamicTypedLinkAttribute',
          Name: 'Name',
          SchemaArn: schemaArn
        },
        Value: {
          StringValue: name
        }
      }],
      LinkName: link || name,
      ParentReference: {
        Selector: parent || '/'
      }
    });
    toast(`Created node: ${name}`, 'lightgreen');
    listObjects();
  }
  catch (e) {
    console.error(e);
    toast('Error creating node', 'red');
    toast(e, 'red');
  }
};

async function addTypedLink(name) {
  await clouddirectory('createTypedLinkFacet', {
    Facet: {
      Attributes: [{
        Name: 'Access',
        RequiredBehavior: 'NOT_REQUIRED',
        Type: 'VARIANT'
      }],
      IdentityAttributeOrder: [
        'Access'
      ],
      Name: name
    },
    SchemaArn: userDirectory.Schemas[userDirectory.Schemas.Current].Latest.Major
  });
};

async function updateGraphData() {
  const nodes = await listObjects();
  console.log(nodes)
  forceGraph.graphData({
    nodes: nodes,
    links: []
  });
  $(window).resize();
}
