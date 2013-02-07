var w = 1280,
	h = 800,
	r = 6,
	z = d3.scale.category20c();

var force = d3.layout.force()
			.gravity(0.05)
			.charge(-150)
			.linkDistance(200)
			.size([w*2/3, h*2/3]);

var editor = CodeMirror.fromTextArea(document.getElementById("query"), {
	lineWrapping: true
});

d3.select('#query_sample')
  .on("change",function(d,i) {
	var queryname = d3.select(this[this.selectedIndex]).attr('name');
	if (queryname != "dummy") {
		d3.text("querysamples/"+queryname,function(sql) {
			editor.setValue(sql);
		});
	}
  });

d3.text("list_samples.php",function(text) {
	var queries=text.split(/,/g);
	if (queries.length > 0) {
		if (queries[0].indexOf("Error") !== -1) {
			alert(queries[0]);
		}
		else {
			for (var i=0;i<queries.length;i++) {
				d3.select('#query_sample')
				  	.append("option")
				  	.text(queries[i].replace(/^[0-9]+\-(.*)\.sql/g,'$1'))
				  	.attr("name",queries[i]);
			}
		}
	}
});

var is_debug=extractUrlParams()['debug'] !== undefined;

var tables= [],
	tableAliases={},
	fields= {},
		 
	links=[],
	functions=[],
	linksToFunctions=[],
	linksToOutput=[];

var n=[],l=[];

var dragFunction = d3.behavior.drag()
	.origin(Object)
	.on("drag", positionFunction),

	dragGround = d3.behavior.drag()
	.origin(Object)
	.on("drag", positionGround);

var svg = d3.select("body").append("svg:svg")
	.attr("id","graph")
	.attr("width", W)
	.attr("height", H)
	.call(d3.behavior.zoom()
		.on("zoom",function() {
			svg.select("svg>g").attr("transform", "translate(" +  d3.event.translate[0] + "," + d3.event.translate[1] + ") scale(" +  d3.event.scale + ")"); 	
		}));

svg.append("defs");
	
d3.select("defs").append("svg:g").selectAll("marker")
    .data(["output"])
  .enter().append("marker")
    .attr("id", String)
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 15)
    .attr("refY", -1.5)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
  .append("path")
    .attr("d", "M0,-5L10,0L0,5");

d3.select("defs").append("svg:g").selectAll("marker")
      .data(["solidlink1","solidlink2"])
    .enter().append("marker")
      .attr("id", String)
      .attr("class","solidlink")
      .attr("refX", function(d,i) {
    	  if (d == "solidlink1") {
    		  return -4;
    	  }
    	  else {
    		  return 14;
    	  }
      })
      .attr("refY", 2.5)
      .attr("markerWidth", 100)
      .attr("markerHeight", 100)
      .attr("orient", "auto")
      .append("rect")
        .attr("width",10)
        .attr("height",5);

var no_parser=false;

d3.text(
	"analyze.php?query=SELECT b.a FROM b",
	function(data) {
		if (data === undefined || data === "") {
			no_parser=true;
			editor.setOption('readOnly',true);
			d3.select('.CodeMirror').attr("style","background-color:rgb(220,220,220)");
			d3.select('#no-parser').attr("class","");
		}
	}
);

d3.select("#OK").on("click",function(d,i) {
	analyzeAndBuild(editor.getValue().replace(/\n/g,' '));
});

function analyzeAndBuild(query) {
	var url;
	if (no_parser) {
		url="analyze.php?sample="+selected_query_sample;
	}
	else {
		url="analyze.php?query="+query;
	}
	if (is_debug) {
		d3.text(
			url+"&debug=1",
			function(data) {
				d3.select('#log').text(data);
			}
		);
		return;
	}
	d3.json(
	  url,	  
	  function (jsondata) {
		console.log(jsondata);
		if (jsondata == null) {
			d3.select('#log').text("Error ! Make sure your paths are properly configured");
			svg.selectAll('image,g').remove();
			return;
		}
		if (jsondata.Error) {
			d3.select('#log').text("ERROR - " + jsondata.Error);
			svg.selectAll('image,g').remove();
			return;
		}
		if (jsondata.Warning) {
			var warningText=[];
			for (var warnType in jsondata.Warning) {
				switch (warnType) {
					case 'No alias':
						for (var i in jsondata.Warning[warnType]) {
							var field_location=jsondata.Warning[warnType][i];
							warningText.push("WARNING - No named alias for field " + i + " located in "+field_location+" clause : field will be ignored");
						}
					break;
				}
			}
			d3.select('#log').text(warningText.join("\n"));
		}
		else {
			d3.select('#log').text("");
		}
		tables= 	 	 [],
		tableAliases=	 {},
		fields= 	 	 {},
		links= 			 [],
		functions=		 [],
		constants=		 [],
		linksToFunctions=[],
		linksToOutput=	 [];
		
		for (var tableName in jsondata.Tables) {
			tables[tableName]=({name:tableName});
			var tableInfo = jsondata.Tables[tableName];
			for (var tableAlias in tableInfo) {
				tableAliases[tableAlias]={'table':tableName,'name':tableAlias};
				var actions=tableInfo[tableAlias];
				for (var type in actions) {
					var actionFields=actions[type];
					for (var field in actionFields) {
						var data=actionFields[field];
						if (fields[tableAlias+"."+field] == undefined) {
							fields[tableAlias+"."+field]={tableAlias:tableAlias, name:field, fullName:tableAlias+"."+field, filtered: false, sort: false};
						}
						switch(type) {
							case 'OUTPUT':
								for (var functionAlias in data) {
									var outputAlias = data[functionAlias];
									if (functionAlias == -1) { // Directly to output
										linksToOutput.push({type: "field", fieldName: tableAlias+"."+field, outputName: outputAlias});
									}
									else { // Through a function
										linksToFunctions.push({fieldName: tableAlias+"."+field, functionAlias: functionAlias});
									}
								}
								
							break;
							case 'CONDITION':
								for (var otherField in data) {
									if (otherField.indexOf(".") != -1) { // condition is related to another field => it's a join
										if (fields[otherField] == undefined) { // In case the joined table isn't referenced elsewhere
											var tableAliasAndField=otherField.split('.');
											fields[otherField]={tableAlias:tableAliasAndField[0], name:tableAliasAndField[1], fullName:otherField, filtered: false, sort: false};
										}
										var joinType=null;
										switch(data[otherField]) {
											case 'JOIN_TYPE_LEFT': joinType='leftjoin'; break;
											case 'JOIN_TYPE_RIGHT': joinType='rightjoin'; break;
											case 'JOIN_TYPE_STRAIGHT': joinType='innerjoin'; break;
											case 'JOIN_TYPE_NATURAL': joinType='innerjoin'; alert('Natural joins are not supported'); break;
										}
										links.push({source: tableAlias+"."+field, target: otherField, type: joinType});
									}
									else { 
										fields[tableAlias+"."+field]['filtered']=true;
									}
								}
							break;
							case 'SORT':
								fields[tableAlias+"."+field]['sort']=data;
							break;
						}
					}
				}
			}
		}
		
		for (var functionAlias in jsondata.Functions) {
			functions[functionAlias]={functionAlias: functionAlias, 
								      name: jsondata.Functions[functionAlias]["name"]
									 };
			var functionDestination=jsondata.Functions[functionAlias]["to"];
			if (functionDestination === "OUTPUT") {
				linksToOutput.push({type: "function", functionAlias: functionAlias, outputName: functions[functionAlias]["alias"]});
			}
			else {
				linksToFunctions.push({sourceFunctionId: functionAlias, functionAlias: functionDestination});
			}
			if (jsondata.Functions[functionAlias]["Constants"] !== undefined) {
				var functionConstants = jsondata.Functions[functionAlias]["Constants"];
				for (var constant in functionConstants) {
					var constantId=constants.length;
					constants.push({id: constantId, name: constant, functionAlias: functionAlias });
					linksToFunctions.push({constantId: constantId, functionAlias: functionAlias});
				}
			}
		}

		var i=0;
		for(var key in fields) {
		  fields[key].id=i++;
		};

		n = d3.values(tables).concat(d3.values(functions));
		l = [];
		for (var i in links) {
			var sourceTableId = parseInt(fieldToTableId(links[i].source));
			var targetTableId = parseInt(fieldToTableId(links[i].target));
			if (l[sourceTableId+","+targetTableId]) {
				l[sourceTableId+","+targetTableId] = {source: sourceTableId, target: targetTableId, value: l[sourceTableId+","+targetTableId].value+1};
			}
			else {
				l[sourceTableId+","+targetTableId] = {source: sourceTableId, target: targetTableId, value: 1};
			}
		}

		for (var i in linksToFunctions) {
			var sourceId;
			if (linksToFunctions[i].constantId !== undefined) { // Not supported yet
				continue;
			}
			else if (linksToFunctions[i].sourceFunctionId) {
				sourceId = parseInt(getFunctionId(linksToFunctions[i].sourceFunctionId));
			}
			else {
				sourceId = parseInt(fieldToTableId(linksToFunctions[i].fieldName));
			}
			var targetId = parseInt(getFunctionId(linksToFunctions[i].functionAlias));
			if (l[sourceId+","+targetId]) {
				l[sourceId+","+targetId] = {source: sourceId, target: targetId, value: l[sourceId+","+targetId].value+1};
			}
			else {
				l[sourceId+","+targetId] = {source: sourceId, target: targetId, value: 1};
			}
		}
		l = d3.values(l);
		console.log(n);
		console.log(l);
		
		buildGraph();

	  });
}

var ground, 
	table, 
	tableText, 
	tableSeparator, 
	tableAlias, 
	field, 
	fieldOrder, 
	fieldText,
	funcText,
	
	path, 
	pathToFunction,
	pathToOutput, 
	outputTexts;

function buildGraph() {	

	//cleanup
	svg.selectAll('image,svg>g').remove();
	var g = svg.append("svg:g");
	
	ground = g.append("svg:image")
	  .attr("xlink:href", "images/ground.svg")
	  .attr("width", 40)
	  .attr("height", 40)
	  .call(dragGround);
	  
	tableBoxes = g.append("svg:g").selectAll("rect.table")
		.data(d3.values(tables))
	  .enter().append("svg:rect")
		.attr("class","table")
		.attr("name", function(d) { return d.name;})
		.attr("width", function(d) { return 120;/*12+d.name.length*7;*/})
		.call(force.drag);
		
	tableText = g.append("svg:g").selectAll("g")
		.data(d3.values(tables))
	  .enter().append("svg:text")
		.text(function(d) { return d.name; });
		
	tableSeparator = g.append("svg:g").selectAll("line")
		.data(d3.values(tables))
	  .enter().append("svg:line")
		.attr("stroke", "black");
		
	tableAlias = g.append("svg:g").selectAll("g")
		.data(d3.values(tableAliases))
	  .enter().append("svg:text")
		.text(function(d) { return d.name; });
		
	tableAliasBoxes = g.append("svg:g").selectAll("g")
		.data(d3.values(tableAliases))
	  .enter().append("svg:rect")
		.attr("class","alias");
		
	field = g.append("svg:g").selectAll("circle")
		.data(d3.values(fields))
	  .enter().append("svg:circle")
		.attr("r",CIRCLE_RADIUS)
		.attr("class",function(d) { return (d.filtered === true ? "filtered" : "")+" "
										  +(d.sort 	   === true ? "sort" 	 : "");
								  });
		
	fieldOrder = g.append("svg:g").selectAll("image.order")
		.data(d3.values(fields).filter(function(f) { return f.sort;}))
	  .enter().append("svg:image")
	    .attr("xlink:href", function(f) { return "images/sort_"+f.sort+".svg";})
	    .attr("class", "order")
		.attr("width",SORT_SIDE)
		.attr("height",SORT_SIDE);
	  
	fieldText = g.append("svg:g").selectAll("g")
		.data(d3.values(fields))
	  .enter().append("svg:text")
		.attr("name",function(d) { return d.tableAlias+"."+d.name; })
		.text(function(d) { return d.name; });
		
	func = g.append("svg:g").selectAll("ellipse.function")
		.data(d3.values(functions))
	  .enter().append("svg:ellipse")
		.attr("class","function")
		.attr("name", function(d) { return d.name;})
		.attr("ry",FUNCTION_BOX_RY+FUNCTION_ELLIPSE_PADDING.top*2)
		.call(force.drag);
		
	funcText = g.append("svg:g").selectAll("g")
		.data(d3.values(functions))
	  .enter().append("svg:text")
		.text(function(d) { return d.name; });

	constantText = g.append("svg:g").selectAll("g")
		.data(d3.values(constants))
	  .enter().append("svg:text")
		.text(function(d) { return d.name; });
	
	
	path = g.append("svg:g").selectAll("path.join")
		.data(links)
	  .enter().append("svg:path")
		.attr("class", "link")
		.attr("marker-start", function(d) { 
			if (d.type == "innerjoin" || d.type == "leftjoin" || d.type == "rightjoin") {
				return "url(#solidlink1)";
			}
		})
		.attr("marker-end", function(d) { 
			if (d.type == "innerjoin") {
				return "url(#solidlink2)";
			}
		});

	pathToFunction = g.append("svg:g").selectAll("path.tofunction")
		.data(linksToFunctions)
	  .enter().append("svg:path")
	    .attr("id", function(d,i) { return "pathtofunction"+i;})
		.attr("class", function(d) { return "link tofunction"; });

	pathToOutput = g.append("svg:g").selectAll("path.output")
		.data(linksToOutput)
	  .enter().append("svg:path")
	    .attr("id", function(d,i) { return "outputpath"+i;})
		.attr("class", function(d) { return "output link "; })
		.attr("marker-end", "url(#output)");

	outputTexts = g.append("svg:g").selectAll("g")
		.data(linksToOutput)
	  .enter().append("svg:text")
	    .attr("class","outputname")
		.append("textPath")
		  .attr("xlink:href",function(d,i) { return "#outputpath"+i;})
		    .attr({"startOffset":20})
		    .append("tspan")
		      .attr("dy",-5)
		      .text(function(d) { return d.outputName; });
	
	// Initial positions
	positionGround.call(ground,null,null,null,false);
	
	force
		.nodes(n)
		.links(l)
		.on("tick", tick)
		.start();
}

function filterFunction(fieldOrFunction, origin, d) {
  if (origin == "all")
	return true;
  if (origin == "field") {
	return fieldOrFunction.fieldName == d.fullName;
  }
  if (origin == "function") {
	 return fieldOrFunction.functionAlias == d.functionAlias 
	 	 || fieldOrFunction.sourceFunctionId == d.functionAlias;
  }
}

function positionPathsToOutput(origin,d) {
  pathToOutput.filter(function(link) {
	return filterFunction(link,origin,d);
  }).attr("d", function(d) { return getPathToOutput(d);});
  
  outputTexts.filter(function(link) {
	return filterFunction(link,origin,d);
  }).attr("dy",OUTPUT_NAME_TOP_PADDING); // Refreshing an attribute on the textPath allows it to be correctly positionned on its corresponding path
}

function positionPathsToFunctions(origin,d) {
	pathToFunction.filter(function(link) {
	  return filterFunction(link,origin,d);
	}).attr("d", function(d) {
		var source,
			sourcePos;
		if (d.fieldName !== undefined) {
			source=field.filter(function(f) { return d.fieldName == f.fullName; });
			sourcePos=[source.attr("cx") || 0, source.attr("cy") || 0];
		}
		else if (d.sourceFunctionId !== undefined) {
			source=func.filter(function(f) { return d.sourceFunctionId == f.functionAlias; });
			sourcePos=[source.attr("cx") || 0, parseInt(source.attr("cy") || 0)
											 + parseInt(source.attr("ry"))];
		}
		else if (d.constantId !== undefined) {
			source=constantText.filter(function(c) { return d.constantId == c.id; });
			sourcePos=[source.attr("x") || 0, source.attr("y") || 0];
		}
	    var target=func.filter(function(f) { return d.functionAlias == f.functionAlias; });
	
	    var x = [sourcePos[0], target.attr("cx") || 0];
	    var y = [sourcePos[1], target.attr("cy") - FUNCTION_BOX_RY || 0];
 	
	    var dx = x[1] - x[0],
		    dy = y[1] - y[0],
		    dr = Math.sqrt(dx * dx + dy * dy);
	    return "M" + x[0] + "," + y[0] + "A" + dr + "," + dr + " 0 0,1 " + x[1] + "," + y[1];
	});
}

function getPathToOutput(info) {
	var source,
		source_y;
	if (info.type == "field") {
		source=field.filter(function(f) { 
			return f.fullName == info.fieldName; 
		});
		source_y=source.attr("cy");
	}
	else {
		source=func.filter(function(f) { return info.functionAlias == f.functionAlias; });
		source_y=parseFloat(source.attr("cy")) + FUNCTION_BOX_RY;
	}
	  
	var dx = ground.attr("x") - source.attr("cx"),
		dy = ground.attr("y") - source_y,
		dr = Math.sqrt(dx * dx + dy * dy);
	return "M" + source.attr("cx") + "," + source_y + "A" + dr + "," + dr + " 0 0,1 " + (parseInt(ground.attr("x"))+parseInt(ground.attr("width"))/2) + "," + ground.attr("y");
}

function positionTable(d, i) {
	var x = d.x;
	var y = d.y;
	
	if (this instanceof SVGImageElement) {
		ground.attr("x", x)
			  .attr("y", y);
		pathToOutput.attr("d", getPathToOutput);
		return;
	}
	
	var relatedAliases = tableAlias.filter(function(ta) { return ta.table == d.name; });
	var relatedAliasesBoxes = tableAliasBoxes.filter(function(ta) { return ta.table == d.name; });
	
	var tableFields = field.filter(function(f) { return isFieldInTable(f, d); });
	
	d3.select(this)
	  .attr("x", this.x = x)
	  .attr("y", this.y = y)
	  .attr("height", MIN_TABLE_HEIGHT+tableFields.data().length * FIELD_LINEHEIGHT)
	  .attr("width", TABLE_NAME_PADDING.left
			  		+CHAR_WIDTH*d3.max([d.name.length,
			  		                    d3.max(tableFields.data(), function(f) { 
			  		                    	return f.name.length; 
			  		                    })
			  		                   ]));
	
	var tableWidth=parseInt(d3.select(this).attr("width"));
	var tableHeight=parseInt(d3.select(this).attr("height"));
	  
	tableText.filter(function(tt) { return tt.name == d.name; })
	  .attr("x", x+TABLE_NAME_PADDING.left)
	  .attr("y", y+TABLE_NAME_PADDING.top);
	  
	tableSeparator.filter(function(ts) { return ts.name == d.name; })
	  .attr("x1", x)
	  .attr("x2", function(ts) { return x+parseInt(d3.select('rect[name="'+ts.name+'"]').attr('width'));})
	  .attr("y1", y+LINE_SEPARATOR_TOP)
	  .attr("y2", y+LINE_SEPARATOR_TOP);
	  
	relatedAliases
	  .attr("x", function(ta,j) { 
		  if (j == 0) {
			  return x+tableWidth+ALIAS_NAME_PADDING.left;
		  }
		  else {
			  var previousAlias = relatedAliases.filter(function(ta2,j2) { 
									return j2 === j-1; 
								  });
			  return parseInt(previousAlias.attr("x"))
			  		+previousAlias.data()[0].name.length*CHAR_WIDTH
			  		+ALIAS_NAME_PADDING.right
			  		+ALIAS_NAME_PADDING.left;
		  }
	  })
	  .attr("y", y+ALIAS_NAME_PADDING.top);
	  
	relatedAliasesBoxes
	  .attr("x", function(ta,j) { 
		return parseInt(relatedAliases.filter(function(ta2,j2) {
										        return j === j2; 
										      })
											.attr("x"))
			   -ALIAS_NAME_PADDING.left;
	  })
	  .attr("y", y+ALIAS_BOX_MARGIN.top)
	  .attr("width",function(ta,j) { return ALIAS_NAME_PADDING.left 
		  								  + Math.max(ta.name.length*CHAR_WIDTH + ALIAS_NAME_PADDING.right,
		  										  	 CIRCLE_RADIUS/2 + SORT_SIDE);
	  							   })
	  .attr("height",tableHeight-ALIAS_BOX_MARGIN.top);
	  
	  
	fieldText.filter(function(f) { return isFieldInTable(f,d);})
	  .attr("x", x+FIELD_PADDING.left)
	  .attr("y", function(f, i) { return y + FIELD_PADDING.top + FIELD_LINEHEIGHT*i; });
		
	
	tableFields
	  .attr("cx", function(f) { return relatedAliases.filter(function(a) { return a.name == f.tableAlias; }).attr("x");})
	  .attr("cy", function(f, i) { return y +FIELD_PADDING.top
		  									+FIELD_LINEHEIGHT*i
		  									-CIRCLE_RADIUS/2; })
	  .each(function(f) {
		positionPathsToFunctions("field", f);
		positionPathsToOutput("field", f);
	  });
		
	
	fieldOrder.filter(function(f) { return isFieldInTable(f,d);})
	  .attr("x", function(f) { return parseInt(field.filter(function(a) { return f.fullName == a.fullName; }).attr("cx"));})
	  .attr("y", function(f) { return parseInt(field.filter(function(a) { return f.fullName == a.fullName; }).attr("cy"))-15;});

	
	path.attr("d", function(d) {
	  var source=field.filter(function(f) { return d.source == f.fullName; });
	  var target=field.filter(function(f) { return d.target == f.fullName; });
	
	  var x = [source.attr("cx") || 0, target.attr("cx") || 0];
	  var y = [source.attr("cy") || 0, target.attr("cy") || 0];
 	
	  var dx = x[1] - x[0],
		  dy = y[1] - y[0],
		  dr = Math.sqrt(dx * dx + dy * dy);
	  return "M" + x[0] + "," + y[0] + "A" + dr + "," + dr + " 0 0,1 " + x[1] + "," + y[1];
	});
}

function positionFunction(d, i) {
	var x=d.x;
	var y=d.y;
	
	funcText.filter(function(func) { return func.functionAlias == d.functionAlias; })
	  .attr("x", function(func) { return x - func.name.length*CHAR_WIDTH/2;})
	  .attr("y", y);

	constantText.filter(function(t) { return t.functionAlias == d.functionAlias; })
	  .attr("x", function(c,j) { return x+30*j; })
	  .attr("y", y-50);
	
	func.filter(function(func) { return func.functionAlias == d.functionAlias; })
	  .attr("cx", x)
	  .attr("cy", y)
	  .attr("rx",function(func,j) { return func.name.length*CHAR_WIDTH+FUNCTION_ELLIPSE_PADDING.left*2; })
	  .each(function(func) {
		positionPathsToFunctions("function",func);
		positionPathsToOutput("function",func);
	  });
	
}

function positionGround(d, i) {
	var drawLinks = d3.event != null;
	
	var x=d3.event == null ? W-45 : (parseInt(d3.select(this).attr("x"))+d3.event.dx);
	var y=d3.event == null ? H-45 : (parseInt(d3.select(this).attr("y"))+d3.event.dy);
	
	ground
	  .attr("x", x)
	  .attr("y", y);

	if (drawLinks) {
		positionPathsToOutput("all");
	}
}

function isFieldInTable(field,table) {
	return tableAliases[field.tableAlias] && tableAliases[field.tableAlias].table == table.name;
}

function fieldToTableId(fieldname) {
	for (var i in n) {
		if (isFieldInTable(fields[fieldname],n[i]))
			return i;
	}
	return null;
}

function getFunctionId(funcName) {
	for (var i in n) {
		if (funcName == n[i].functionAlias)
			return i;
	}
	return null;
}

function extractUrlParams(){	
	var t = location.search.substring(1).split('&');
	var f = [];
	for (var i=0; i<t.length; i++){
		var x = t[ i ].split('=');
		f[x[0]]=(x[1] == undefined ? null : x[1]);
	}
	return f;
}

function tick() {
	var q = d3.geom.quadtree(n),
      	i = 0,
      	nl = n.length;

	while (++i < nl) {
		q.visit(collide(n[i]));
	}
  
	tableBoxes.each(function(d,i) {
		positionTable.call(this,d,i);
	});
	func.each(function(d,i) {
		positionFunction.call(this,d,i);
	});
	console.log("tick");
}

function collide(node) {
	var node_element=tableBoxes.filter(function(d,i) { return d.name == node.name; });
	if (node_element[0].length == 0)
		return function() { return true; };
	var width=parseInt(node_element.attr("width"));
	var height=parseInt(node_element.attr("height"));
	var nx1 = node.x, 
		nx2 = node.x + width, 
		ny1 = node.y, 
		ny2 = node.y + height;
	return function(quad, x1, y1, x2, y2) {
		if (quad.point && (quad.point !== node)) {
			var quad_element=tableBoxes.filter(function(d,i) { return d.name == quad.point.name; });
			if (quad_element[0].length == 0)
				return true;
			var quad_element_width=parseInt(quad_element.attr("width"));
			var quad_element_height=parseInt(quad_element.attr("height"));
			
			var x = node.x - quad.point.x, 
				y = node.y - quad.point.y, 
				l = Math.sqrt(x * x + y * y), 
				r = (width+height)/4 + (quad_element_width+quad_element_height)/4;

			var qx1 = quad.point.x, 
				qx2 = quad.point.x + quad_element_width, 
				qy1 = quad.point.y, 
				qy2 = quad.point.y + quad_element_height;
			//if (l < r) {
			if ((qx1 >= nx1 && qx1 <= nx2 && qy1 >= ny1 && qy1 <= ny2)
			 || (nx1 >= qx1 && nx1 <= qx2 && ny1 >= qy1 && ny1 <= qy2)) {
				l = ((l - r) / l) * .5;
				x *= l;
				y *= l;
				node.x -= x;
				node.y -= y;
				quad.point.x += x;
				quad.point.y += y;
			}
		}
		return x1 > nx2
			|| x2 < nx1 
			|| y1 > ny2 
			|| y2 < ny1;
	};
}