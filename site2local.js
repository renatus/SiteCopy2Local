// This app will download a backup archive from remote server
// and will deploy site's copy on a local computer.
// It checks, if we've already processed most recent archive to date,
// and if yes, it will do nothing, so you may run app very often.
// It also pings site's frontpage to make it load quicker later on,
// and it stores some of the backup archives permanently.
 
 
 
// Node.js convention of providing a single callback as the last argument of
// your asynchronous function -- a callback which expects an Error as its first
// argument -- and calling the callback once.



// We may use "const" instead of "var" here, but "const" usage may decrease performance in Chrome (while increasing it a bit at Firefox)
// https://jsperf.com/const-vs-var-mod-3

// From NodeJS core
//var path = require('path');
//var fs = require("fs"); //Load the filesystem module

// You've to use http for http and https for https
var http = require('http');
//var https = require('https');

// Need this to execute Shell commands
var exec = require('child_process').exec;

// From ps-tree package
// You may kill .exec child process with child.kill()
// Or just by providing an optional argument {timeout: 5000}, when initiating it
// But it only works in case child process doesn't spawn it's own children
// To kill 'em all , we need to travel recursively down the child's process tree
// 'ps-tree' lib does that for us: https://github.com/indexzero/ps-tree 
var psTree = require('ps-tree');
// From SSH2 package, to work with SSH protocol
var Client = require('ssh2').Client;
// From fs-extra package
//https://www.npmjs.com/package/fs-extra
// Fs-extra is an advansed filesystem module, and drop-in replacement for fs
// It supports everything fs core module supports - and more
var fs = require("fs-extra"); 

// Load app settings
// You don't have to load and parse JSON file explicitly, just use "require"
var appConf = require("./appConf.json");

// Load app "database"-object - it stores data on things like last successfull run, etc.
var appDataObj = require("./appData.json");



// appRoot will give you a folder name, where you've initiated your script, NOT the folder it's actually located
// Same is true for ./
//var appRoot = process.cwd();

// Compute archive name we're going to work with based on current time.
var dateTime = new Date();
// Current timestamp - 10 minutes (we don't want to try to download archive which is being created right now)
var dateTimeStamp = dateTime.getTime() - 600000;
var curYear = dateTime.getUTCFullYear();
var curMonth = ((dateTime.getUTCMonth()+1)<10?'0':'') + (dateTime.getUTCMonth()+1);
// JS counts January as 0th month, you've to use according month numeration for all calculations
var curMonthJS = (dateTime.getUTCMonth()<10?'0':'') + dateTime.getUTCMonth();
var curDate = (dateTime.getUTCDate()<10?'0':'') + dateTime.getUTCDate();

// Get yesterday date (may be in previous month or even year)
var dateTimeYest = new Date();
// Minus one day
dateTimeYest.setDate(dateTimeYest.getDate() - 1);
var yestYear = dateTimeYest.getUTCFullYear();
var yestMonth = ((dateTimeYest.getUTCMonth()+1)<10?'0':'') + (dateTimeYest.getUTCMonth()+1);
var yestDate = (dateTimeYest.getUTCDate()<10?'0':'') + dateTimeYest.getUTCDate();

// Get timeslots for today's backups
// Date.UTC(YYYY,MM,DD,HH,MM)
// var backupTime1 = new Date(Date.UTC(2016,11,07,07,17)).getTime();
// First backup
var backupTime1 = new Date(Date.UTC(curYear,curMonthJS,curDate,appConf["backupHour1"],appConf["backupMin1"])).getTime();
// Second backup
var backupTime2 = new Date(Date.UTC(curYear,curMonthJS,curDate,appConf["backupHour2"],appConf["backupMin2"])).getTime();

// Generate filename, like 2016_11_06-0717-your_site_backup.tar.gz
var fileName = "";
if (dateTimeStamp < backupTime1) {
  // If current timestamp is smaller than timestamp of a first backup for today
  // We've to use last backup for yesterday
  fileName = yestYear + "_" + yestMonth + "_" + yestDate + "-" + appConf["backupHour2"] + appConf["backupMin2"] + appConf["backupNameEnd"];
} else if (dateTimeStamp >= backupTime1 && dateTimeStamp < backupTime2) {
  // If current timestamp is greater than timestamp of a first backup for today,
  // but smaller than timestamp of a last backup for today
  // We've to use first backup for today
  fileName = curYear + "_" + curMonth + "_" + curDate + "-" + appConf["backupHour1"] + appConf["backupMin1"] + appConf["backupNameEnd"];
} else if (dateTimeStamp >= backupTime2) {
  // If current timestamp is greater than timestamp of a last backup for today
  // We've to use last backup for today
  fileName = curYear + "_" + curMonth + "_" + curDate + "-" + appConf["backupHour2"] + appConf["backupMin2"] + appConf["backupNameEnd"];
}



//+ Working with subfolders for temporary backup storage (like 2017_02)

// appConf["localTmpBackupsFolder"] may contain either global path, like:
// /home/USERNAME/backups
// or relative (to app's root directory) path, like
// tmp/backups
// tmpBackupFolderPath variable should contain something like /home/USERNAME/nodeapp/tmp/backups
var tmpBackupFolderPath = "";
if(appConf["localTmpBackupsFolder"].charAt(0) != "/") {
  // If first symbol is not  /, we have local path
  tmpBackupFolderPath = __dirname +  "/" + appConf["localTmpBackupsFolder"];
} else {
  // If first symbol is /, we have global path
  tmpBackupFolderPath = appConf["localTmpBackupsFolder"];
}
// Something like /home/USERNAME/nodeapp/tmp
var localTmpFolder = __dirname + "/" + appConf["localTmpFolder"];
// Something like /home/USERNAME/nodeapp/tmp/backups/2017_02
var curBackupFolderPath = tmpBackupFolderPath + "/" + curYear + "_" + curMonth;
// Backup filepath, like /home/USERNAME/nodeapp/tmp/backups/2016_11/2016_11_06-0717-your_site_backup.tar.gz
var curBackupFilePath = curBackupFolderPath + "/" + fileName;
//console.log("Current backup path: " + curBackupFilePath);

// Create temporary backup folder for current month (like 2017_02) if it doesn't exist
fs.ensureDir(curBackupFolderPath, function (err) {
  if (err) return console.error(err);
  // Folder has now been created, including the directory it is to be placed in
});



// Function to delete all temporary backup folders (like 2016_09) and their content, that are older, than X months
// Exact number of months should be chosen by user, see appConf["backupStoreTempForXMonths"]
// Process is async, but we don't have to wait for it's end to proceed
function delOldTmpBackupFolders() {
// Get names of all subfolders from temporary backup folder
  var folderNamesArr = [];
  fs.readdir(tmpBackupFolderPath, function (err, items) {
    folderNamesArr = items;
    // Place folder names in reverse order, from newest to oldest (2017_02, 2017_01, ...)
    folderNamesArr = folderNamesArr.reverse();

    // Iterate through all folder names
    for (var i = 0; i < folderNamesArr.length; i++) {
      // If folder is older, than X months, delete it
      if (i >= appConf["backupStoreTempForXMonths"]) {
        console.log(folderNamesArr[i] + ' folder will be deleted.');
        fs.remove(tmpBackupFolderPath + "/" + folderNamesArr[i], function (err) {
          if (err) return console.error(err);
          // For some strange reason, folderNamesArr[i] returns undefined
          //console.log(folderNamesArr);
          //console.log(i);
          //console.log(folderNamesArr[i] + ' folder was deleted.');
        });
      }
    }
  });
}

//- Working with subfolders for temporary backup storage (like 2017_02)



console.log("We're about to process " + fileName);

// Save archive name to indicate we've worked with it
appDataObj["lastRunFileName"] = fileName;
// Save date and time when we've started our program
appDataObj["lastRunStartTimeTxt"] = dateTime.toString();
appDataObj["lastRunStartTimestamp"] = dateTimeStamp;
// Save appData object to JSON file
writeAppData();




if(appDataObj["lastSuccessFileName"] != fileName) {
  // If we've not successfully processed archive with such a name yet
  fileDownload();
} else {
  console.log("We've successfully processed this archive already, next will be imported in a time you've set at appConf.json file.");
}


// Download site's archive from remote server 
function fileDownload(){
  // Connect to server via SSH
  var conn = new Client();
  conn.on('ready', function() {
    console.log("We'ready to download archive via SSH");
  
    conn.sftp(function(err, sftp) {
      if (err) throw err;

      // First argument - full path to file at remote machine, second - to a copy we're about to create at local machine
      sftp.fastGet(appConf["remoteBackupFolder"] + fileName, curBackupFilePath, function(err, list) {
        if (err) throw err;
        conn.end();
        console.log("File was downloaded.");
      
        // Better to check filesize, even if we're about to check checksum
        // Archive may be corrupted during it's creation
        var stats = fs.statSync(curBackupFilePath);
        var fileSizeBytes = stats["size"];
        // If an archive is not too small
        if(appConf["backupMinSizeBytes"] < fileSizeBytes) {
          // Initiate backup archive extraction
          fileUntar(fileName);
          // Save date and time we've successfully ended untar process
          var dateTime = new Date();
          appDataObj["lastUnarchiveEndTimeTxt"] = dateTime.toString();
          appDataObj["lastUnarchiveEndTimestamp"] = dateTime.getTime();
          
          // If user wants to store archive permanently every X days
          if (appConf["backupStorePermEveryXDays"]) {
            // Initiate permanent storage checking
            backupStorePerm();
          }
        } else {
          console.log("Archive is too small, probably corrupted!");
        }
      });
    });
  
  // Something like:
  //host: '198.245.18.16',
  //port: 22,
  //username: 'ServerUserName',
  //password: 'YOURPASS'
  }).connect({
    // You may enable debugging
    //debug: console.log,
    host: appConf["remoteHost"],
    port: appConf["remotePort"],
    username: appConf["remoteUsername"],
    password: appConf["remotePassword"]
  });
}



// Extract content from backup archive
function fileUntar(fileName) {
  // We'll delete old site's files in a first place, to shut down site for an update process
  fs.emptyDir(appConf["localSiteFolder"], function (err) {
    if (!err) console.log("Old site's files were deleted.");

    // Path to folder, where we'll extract content from the archive
    // Something like /home/USERNAME/dev/localcopy/tmp/var/www/YOURSITE.COM/
    // Archive recreates server file structure at tmp folder, like /var/www/YOURSITE.COM/
    var tmpSiteFolder = localTmpFolder + appConf["remoteSiteFolder"];
    // Path to DB backup file
    var sqldumpPath = tmpSiteFolder + appConf["sqldumpName"];

    // Example comand to extract archive content:
    // exec('tar -zxvf ' + curBackupFilePath, {maxBuffer: 1024000}, (error, stdout, stderr) => {
    // Without {maxBuffer: 1024000} you may face an error:
    // exec error: Error: stdout maxBuffer exceeded
    exec('tar -zxvf ' + curBackupFilePath + ' -C ' + localTmpFolder, {maxBuffer: 1024000}, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return;
      }

      //console.log(`stdout: ${stdout}`);
      //console.log(`stderr: ${stderr}`);
      if (stderr) return console.error(stderr);

      // Copy site's files to their permanent location
      fs.copy(tmpSiteFolder, appConf["localSiteFolder"], function (err) {
        if (err) return console.error(err);
        console.log("Site's files were copied sucessfully");
        // Initiate database replacement with a version from a backup
        dbDrop(sqldumpPath);
        
        // Delete all old temporary backup folders (like 2016_09)
        // We should not initiate this process earlier, since user may choose
        // not to store backups temporarily, but we need current backup, up to
        // this moment.
        delOldTmpBackupFolders();
      });
    });
  });
}



// Replace old version of your site's database with a new one
function dbDrop(sqldumpPath){
// List of commands we should execute:
// mysql -uroot -pPASSWORD -e "DROP DATABASE tstbase";
// mysql -uroot -pPASSWORD -e "CREATE DATABASE tstbase";
// mysql -uroot -pPASSWORD -e "GRANT ALL ON tstbase.* TO 'tstbaseuser'@'localhost' IDENTIFIED BY 'tstbaseuserpassword'";
// mysql -uroot -pPASSWORD tstbase < dbbackup.sql

  // Drop existing database
  exec("mysql -u" + appConf["localMysqlRootUname"] + " -p" + appConf["localMysqlRootUpass"] + ' -e "DROP DATABASE ' + appConf["remoteMysqlSiteDbName"] + '";', {maxBuffer: 1024000}, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    } else {
      console.log("Local database was dropped");
      dbCreate(sqldumpPath);
    }
  }); 
}

// Create new database
function dbCreate(sqldumpPath){
  exec("mysql -u" + appConf["localMysqlRootUname"] + " -p" + appConf["localMysqlRootUpass"] + ' -e "CREATE DATABASE ' + appConf["remoteMysqlSiteDbName"] + '";', {maxBuffer: 1024000}, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    } else {
      console.log("Local database was created");
      dbGrant(sqldumpPath);
    }
  });
}

// Grant necessary permissions to MySQL user
function dbGrant(sqldumpPath){
  exec("mysql -u" + appConf["localMysqlRootUname"] + " -p" + appConf["localMysqlRootUpass"] + ' -e "GRANT ALL ON ' + appConf["remoteMysqlSiteDbName"] + ".* TO '" + appConf["remoteMysqlSiteUname"] + "'@'localhost' IDENTIFIED BY '" + appConf["remoteMysqlSiteUpass"] + "'" + '";', {maxBuffer: 1024000}, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    } else {
      console.log("Necessary DB permissions were granted to user");
      dbReplace(sqldumpPath);
    }
  });
}

// Import data from .sql file to new database
function dbReplace(sqldumpPath){
  // Code after exec statement will be executed before exec was executed
  exec("mysql -u" + appConf["localMysqlRootUname"] + " -p" + appConf["localMysqlRootUpass"] + " " + appConf["remoteMysqlSiteDbName"] + " < " + sqldumpPath, {maxBuffer: 1024000}, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    } else {
      var endDateTime = new Date();
      // Save name of archive we've proceed sucessfully
      appDataObj["lastSuccessFileName"] = fileName;
      // Save date and time we've successfully finished our program
      appDataObj["lastSuccessTimeTxt"] = endDateTime.toString();
      appDataObj["lastSuccessTimestamp"] = endDateTime.getTime();
      // Save appData object to JSON file
      writeAppData();

      console.log("Database content was imported from .sql file");
      console.log("Local copy of site at " + appConf["localSiteFolder"] + " was updated!");
      console.log("Process has started at " + dateTime.toString());
      console.log("Process has ended at " + endDateTime.toString());
      
      // Start PHP built-in server
      startPhpServer();
      
      // Initiate HTTP request to site's local copy frontpage, so it'll load quicker next time
      // We need a timeout, so the PHP built-in server will have enough time to start
      // before we'll initiate HTTP request to a local copy of a site
      // Timeout is being set in milliseconds, 5000 = 5 seconds
      setTimeout(function(){
        console.log('Initiating test HTTP request');
        // Initiate HTTP request
        makeHTTPSRequest(appConf["localHostAddr"], appConf["localRelPath"], appConf["localPort"], processRequestResults);
      }, 5000);
    }
  });
  console.log("Database content import from .sql file was started.");
}

// Write app "database"-object to JSON file
// It stores data on things like last successfull run, etc.
function writeAppData(){
  // Third JSON.stringify argument indicates the number of space characters to use as white space
  fs.writeFile(__dirname + "/appData.json", JSON.stringify(appDataObj, null, 2) , 'utf-8');
}



//+ Load front page of a site's local copy, so it'll start quicker next time

// Function to load given web page
// Callback argument is a callback function name
// Host, path and port examples: 'localhost', '/index.php', 8000
// Since port 8000 is widely used for development and may be occupied, we shouldn't use it
function makeHTTPSRequest(urlHost, urlRelPath, urlPort, callback) {
  // Mistake in protocol or port settings will give you an error like this:
  // events.js:160 throw er; Unhandled 'error' event
  // https.get + port: 443
  // http.get + port: 80
  // For HTTPS: return https.get({
  return http.get({
    //host: 'yoursite.biz',
    host: urlHost,
    //path: '/index.php',
    path: urlRelPath,
    //port: 443
    port: urlPort
  }, function(response) {
    // Page is being read in chunks
    // Continuously update stream with data
    var pageBody = '';
    response.on('data', function(d) {
      pageBody += d;
    });
    response.on('end', function() {
      // Data reception is done
      // For now we'll just send it to callback function processRequestResults
      callback(pageBody);
    });
  });
}

// Process web page content, after page request has finished
function processRequestResults(pageBody) {
  // Print HTML code of requested page
  console.log(pageBody);
  // Kill PHP built-in server process, you need 'ps-tree' lib for it to work
  // child.pid gives you it's process ID
  kill(child.pid);
  // When PHP server process is killed, you'll get such error message:
  // exec error: Error: Command failed: php7.0 -S localhost:8013 -t ~/dev/www/yoursite.biz/
  // That's not an indication of a problem
  // since rogue children are more likely to give us severe failures, when killed,
  // because the OS won't auto-kill them when the parent exits.
}



// Function to kill child porcess with own childs - i.e. PHP built-in server
// Don't forget to require 'ps-tree' for this function to work
// Looks like ps-tree only works on UNIX-like OSes, for Windows you should use taskkill utility
// http://krasimirtsonev.com/blog/article/Nodejs-managing-child-processes-starting-stopping-exec-spawn
function kill(pid, signal, callback) {
  signal   = signal || 'SIGKILL';
  callback = callback || function () {};
  var killTree = true;
  if(killTree) {
    psTree(pid, function (err, children) {
      [pid].concat(
        children.map(function (p) {
          return p.PID;
        })
      ).forEach(function (tpid) {
        try { process.kill(tpid, signal) }
        catch (ex) { }
      });
        callback();
    });
  } else {
    try { process.kill(pid, signal) }
    catch (ex) { }
    callback();
  }
};



// Start PHP built-in server
// child variable should be global, since we need to call it from other functions to stop PHP server
var child = '';
function startPhpServer() {
// Without {maxBuffer: 1024000} you may face an error:
// exec error: Error: stdout maxBuffer exceeded
// Sample command to start PHP server: 'php7.0 -S localhost:8022 -t ~/dev/www/yoursite.biz/'
  child = exec(appConf["localPhpCommand"] + ' -S ' + appConf["localHostAddr"] + ':' + appConf["localPort"] + ' -t ' + appConf["localSiteFolder"], {maxBuffer: 1024000}, (error, stdout, stderr) => {
    if (error) {
      // There is an error
      console.error(`exec error: ${error}`);
      return;
    }
    // No errors
    //console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);
  });
}

//- Load front page of a site's local copy, so it'll start quicker next time



// Save archive permanently once in X days, if it's time to do so
function backupStorePerm() {
  // Number of milliseconds in X days
  var backupStorePermEveryXMilSeconds = appConf["backupStorePermEveryXDays"] * 86400 * 1000;
  
  var curDateTime = new Date();
  // Get textual representation of date and time
  var curTimeTxt = curDateTime.toString();
  // Get timestamp
  var curTimestamp = curDateTime.getTime();
  
  // If some archives were stored permanently earlier
  if(appDataObj["backupStorePermLastTimestamp"]) {
    // Count time (in seconds) since we've stored a file last time
    var backupStorePermTimeSinceLast = curTimestamp - appDataObj["backupStorePermLastTimestamp"];
  }

  // If no archives were stored permanently yet, or a given period has passed already since then
  if(!appDataObj["backupStorePermLastTimestamp"] || backupStorePermTimeSinceLast > backupStorePermEveryXMilSeconds) {
    console.log("It's time to store archive file permanently.");
    
    // appConf["localPermBackupsFolder"] may contain either global path, like:
    // /home/USERNAME/permanent
    // or relative (to app's root directory) path, like
    // permanent/backups
    // permBackupFolderPath should contain something like /home/USERNAME/nodeapp/permanent/backups/2017
    var permBackupFolderPath = "";
    if (appConf["localPermBackupsFolder"].charAt(0) != "/") {
      // If first symbol is not  /, we have local path
      permBackupFolderPath = __dirname + "/" + appConf["localPermBackupsFolder"] + "/" + curYear;
    } else {
      // If first symbol is /, we have global path
      permBackupFolderPath = appConf["localPermBackupsFolder"] + "/" + curYear;
    }
    // Should contain something like /home/USERNAME/nodeapp/permanent/backups/2017/2016_11_06-0717-your_site_backup.tar.gz
    var permBackupFilePath = permBackupFolderPath+ "/" + fileName;
    
    // Create permanent backup folder for current year (like 2017) if it doesn't exist
    fs.ensureDir(permBackupFolderPath, function (err) {
      if (err) return console.error(err);
      // Folder has now been created, including the directory it is to be placed in

      // Copy site's archive to it's permanent location
      fs.copy(curBackupFilePath, permBackupFilePath, function (err) {
        if (err) return console.error(err);
      });
    });

    appDataObj["backupStorePermLastTimeTxt"] = curTimeTxt;
    appDataObj["backupStorePermLastTimestamp"] = curTimestamp;
    appDataObj["backupStorePermLastFileName"] = fileName;
    // Save appData object to JSON file
    writeAppData();
  } else {
    console.log("For now we don't have to store archive permanently.");
  }
}