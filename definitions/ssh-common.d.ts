declare module 'ssh-common/ssh-common' {
    export class RemoteCommandOptions {
    }

    export class SshHelper {
        /**
         * Constructor that takes a configuration object of format
         * {
            host: hostname,
            port: port,
            username: username,
            privateKey: privateKey,
            passphrase: passphrase
       }
         * @param sshConfig
         */
        constructor(sshConfig:any);

        /**
         * Close any open client connections for SSH, SCP and SFTP
         */
        closeConnection();

        /**
         * Uploads a file to the remote server
         * @param sourceFile
         * @param dest, folders will be created if they do not exist on remote server
         * @returns {Promise<string>}
         */
        uploadFile(sourceFile:string, dest:string);

        /**
         * Returns true if the path exists on remote machine, false if it does not exist
         * @param path
         * @returns {Promise<boolean>}
         */
        checkRemotePathExists(path:string);

        /**
         * Runs specified command on remote machine, returns error for non-zero exit code
         * @param command
         * @param options
         * @returns {Promise<string>}
         */
        runCommandOnRemoteMachine(command:string, options:RemoteCommandOptions);
    }
}
