# README

This app will download a backup archive from remote server
and will deploy site's copy on a local computer. App is tailored to work with
PHP/MySQL-based sites.

It checks, if we've already processed most recent archive to date,
and if yes, it will do nothing, so you may run app very often.
It also pings site's local copy frontpage to make it load quicker later on,
and it stores some of the backup archives permanently, and all of them -
temporarily, for X months.

To run app, you need NodeJS, PHP and MySQL installed on your local machine.
Install node dependencies at app's root folder:
cd /PATH/TO/SCRIPT/site2local
npm install
And use such command to start:
nodejs /PATH/TO/SCRIPT/site2local/site2local.js
You may (and, likely, should) add this command to CRON. It may be reasonable to
run it every hour, so relatively soon after switching on your PC local site copy
will be updated.

However, you need to configure app before the first start.

- Copy "appData.json.example" file to the same folder, and rename the copy to
"appData.json". Note, that if you want, you overwrite it again anytime, and app
will "forget" about all copies and backups it has made (though, of course,
archives themselves will remain on your disk), it will be effectively a fresh
start.

- Copy "appConf.json.example" file to the same folder, and rename the copy to
"appConf.json".

- Modify certain values in "appConf.json" file.

Your archive should have a name like 2016_11_06-0717-your_site_backup.tar.gz
"backupHour" and "backupMin" vars should contain hours and minutes from the
archive name, here it would be "07" and "17". You've "backupHour1", "backupMin1",
"backupHour2" and "backupMin2", so two archives per day will be processed.

"backupNameEnd" should contain last part of archive name, like
"-your_site_backup.tar.gz".

"backupMinSizeBytes" should contain minimal archive size in bytes, if the
archive is smaller, it would be considered corrupted, and app will stop to
preserve your existing site's copy.

"remoteBackupFolder" should contain SERVER's absolute path to folder with
archives.

"remoteSiteFolder" should contain SERVER's absolute path to folder with
site we're copying.

"localSiteFolder" should contain local absolute path to folder with
site's copy.

"sqldumpName" should contain your .sql DB backup file name. It should reside in
folder next to your index.php file.

"localUserID" should contain your Linux user ID, like 1000. Use "id -u USERNAME" command to get it.

"localGroupID" should contain your Linux group ID, like 1000. Use "id -g GROUPNAME" command to get it.

"remoteHost" should contain IP address of your server.

"remotePort" should contain port number to connect to your server via SSH.

"remoteUsername" and "remotePassword" should contain login and password to
connect to your server via SSH.

"localHostAddr" and "localRelPath" should form local URL to access site's copy.
Something like "localhost/index.php"

"localPort" should contain port number  to access site's local copy. Better not
to use 8000, since it's often being used for other dev tasks.

"localPhpCommand" should contain command to call for PHP. "php" will work just
fine, but you may have couple of PHP versions installed on your machine, so you
can choose one to run your site, for example "php7.0".

"localMysqlRootUpass" should contain local MySQL root password.

"remoteMysqlSiteDbName", "remoteMysqlSiteUname" and "remoteMysqlSiteUpass"
should contain credentials to access your site DB (both on server and local
machine)

"backupStoreTempForXMonths" indicates, that you want to store all archives app
had downloaded for X months. If you'll set it to 2, archives for current and
past months will be stored, older ones - dropped. If you don't want to store
them, set it to 0.

"backupStorePermEveryXDays" indicates, that you want to store one archive app
had downloaded in X days permanently. If you'll set it to 7, one archive in a
week will be stored permanently. If you don't want to store anything, set it to
"".

"localTmpBackupsFolder" should contain path to folder to store backups
temporarily. Path may be either relative to app's root folder, or absolute, like
/home/USERNAME/temparchives

"localPermBackupsFolder" should contain path to folder to store backups
permanently. Path may be either relative to app's root folder, or absolute, like
/home/USERNAME/permarchives

"localTmpFolder" should contain path to folder to store temporary files. Path
should be relative to app's root folder.
