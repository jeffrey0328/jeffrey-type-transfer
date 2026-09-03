using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Threading;

namespace JeffreyTypeTransfer.NativeMessaging
{
    [DataContract]
    internal sealed class HostRequest
    {
        [DataMember(Name = "action")]
        public string Action { get; set; }
    }

    [DataContract]
    internal sealed class HostConfig
    {
        [DataMember(Name = "nodePath")]
        public string NodePath { get; set; }

        [DataMember(Name = "projectRoot")]
        public string ProjectRoot { get; set; }
    }

    [DataContract]
    internal sealed class HostResponse
    {
        [DataMember(Name = "ok")]
        public bool Ok { get; set; }

        [DataMember(Name = "started", EmitDefaultValue = false)]
        public bool Started { get; set; }

        [DataMember(Name = "alreadyRunning", EmitDefaultValue = false)]
        public bool AlreadyRunning { get; set; }

        [DataMember(Name = "code", EmitDefaultValue = false)]
        public string Code { get; set; }

        [DataMember(Name = "message")]
        public string Message { get; set; }
    }

    internal enum BridgeProbe
    {
        Available,
        Free,
        Occupied
    }

    internal static class Program
    {
        private const int MaxMessageBytes = 1024 * 1024;
        private const string HealthUrl = "http://127.0.0.1:8989/health?provider=codex";

        private static int Main()
        {
            HostResponse response;
            try
            {
                HostRequest request = ReadMessage<HostRequest>();
                response = Handle(request);
            }
            catch
            {
                response = Failure("native-host-invalid-request", "本机桥接助手收到无效请求");
            }

            try
            {
                WriteMessage(response);
                return 0;
            }
            catch
            {
                return 1;
            }
        }

        private static HostResponse Handle(HostRequest request)
        {
            string action = request == null ? null : request.Action;
            if (String.Equals(action, "ping", StringComparison.Ordinal))
            {
                LoadAndValidateConfig();
                return Success(false, false, "本机桥接助手已安装");
            }

            if (!String.Equals(action, "start", StringComparison.Ordinal))
            {
                return Failure("native-host-action-not-allowed", "本机桥接助手只允许启动固定的本地桥接服务");
            }

            BridgeProbe initialProbe = ProbeBridge();
            if (initialProbe == BridgeProbe.Available)
            {
                return Success(false, true, "本地桥接已在运行");
            }
            if (initialProbe == BridgeProbe.Occupied)
            {
                return Failure("bridge-port-in-use", "127.0.0.1:8989 已被其他程序占用");
            }

            HostConfig config;
            try
            {
                config = LoadAndValidateConfig();
            }
            catch
            {
                return Failure("native-host-config-invalid", "本机桥接助手配置无效，请重新运行注册脚本");
            }

            Process child;
            try
            {
                string serverPath = Path.Combine(config.ProjectRoot, "bridge", "server.mjs");
                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = config.NodePath;
                startInfo.Arguments = QuoteArgument(serverPath) + " --native-launch";
                startInfo.WorkingDirectory = config.ProjectRoot;
                startInfo.UseShellExecute = true;
                startInfo.CreateNoWindow = true;
                startInfo.WindowStyle = ProcessWindowStyle.Hidden;

                child = Process.Start(startInfo);
                if (child == null)
                {
                    return Failure("bridge-launch-failed", "无法启动本地桥接进程");
                }
            }
            catch
            {
                return Failure("bridge-launch-failed", "无法启动本地桥接进程，请检查 Node.js 是否可用");
            }

            for (int attempt = 0; attempt < 24; attempt += 1)
            {
                if (ProbeBridge() == BridgeProbe.Available)
                {
                    return Success(true, false, "本地桥接已启动");
                }
                if (child.HasExited)
                {
                    return Failure("bridge-process-exited", "本地桥接进程启动后意外退出");
                }
                Thread.Sleep(250);
            }

            return Failure("bridge-start-timeout", "本地桥接启动超时");
        }

        private static HostConfig LoadAndValidateConfig()
        {
            string configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "host-config.json");
            using (FileStream stream = File.OpenRead(configPath))
            {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(HostConfig));
                HostConfig config = (HostConfig)serializer.ReadObject(stream);
                if (config == null || String.IsNullOrWhiteSpace(config.NodePath) ||
                    String.IsNullOrWhiteSpace(config.ProjectRoot))
                {
                    throw new InvalidDataException();
                }

                config.NodePath = Path.GetFullPath(config.NodePath);
                config.ProjectRoot = Path.GetFullPath(config.ProjectRoot);
                string serverPath = Path.Combine(config.ProjectRoot, "bridge", "server.mjs");
                if (!File.Exists(config.NodePath) || !File.Exists(serverPath))
                {
                    throw new FileNotFoundException();
                }
                return config;
            }
        }

        private static BridgeProbe ProbeBridge()
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(HealthUrl);
                request.Method = "GET";
                request.Timeout = 5000;
                request.ReadWriteTimeout = 5000;
                request.Proxy = null;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                {
                    string body = reader.ReadToEnd();
                    return response.StatusCode == HttpStatusCode.OK &&
                        body.IndexOf("\"provider\"", StringComparison.Ordinal) >= 0 &&
                        body.IndexOf("\"installed\"", StringComparison.Ordinal) >= 0
                        ? BridgeProbe.Available
                        : BridgeProbe.Occupied;
                }
            }
            catch (WebException error)
            {
                return error.Status == WebExceptionStatus.ConnectFailure
                    ? BridgeProbe.Free
                    : BridgeProbe.Occupied;
            }
            catch
            {
                return BridgeProbe.Occupied;
            }
        }

        private static string QuoteArgument(string value)
        {
            return "\"" + value.Replace("\"", "\\\"") + "\"";
        }

        private static HostResponse Success(bool started, bool alreadyRunning, string message)
        {
            return new HostResponse
            {
                Ok = true,
                Started = started,
                AlreadyRunning = alreadyRunning,
                Message = message
            };
        }

        private static HostResponse Failure(string code, string message)
        {
            return new HostResponse { Ok = false, Code = code, Message = message };
        }

        private static T ReadMessage<T>()
        {
            Stream input = Console.OpenStandardInput();
            byte[] lengthBytes = ReadExactly(input, 4);
            int length = BitConverter.ToInt32(lengthBytes, 0);
            if (length <= 0 || length > MaxMessageBytes)
            {
                throw new InvalidDataException();
            }

            byte[] payload = ReadExactly(input, length);
            using (MemoryStream stream = new MemoryStream(payload))
            {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(T));
                return (T)serializer.ReadObject(stream);
            }
        }

        private static byte[] ReadExactly(Stream stream, int length)
        {
            byte[] buffer = new byte[length];
            int offset = 0;
            while (offset < length)
            {
                int read = stream.Read(buffer, offset, length - offset);
                if (read == 0) throw new EndOfStreamException();
                offset += read;
            }
            return buffer;
        }

        private static void WriteMessage<T>(T message)
        {
            byte[] payload;
            using (MemoryStream stream = new MemoryStream())
            {
                DataContractJsonSerializer serializer = new DataContractJsonSerializer(typeof(T));
                serializer.WriteObject(stream, message);
                payload = stream.ToArray();
            }

            Stream output = Console.OpenStandardOutput();
            byte[] lengthBytes = BitConverter.GetBytes(payload.Length);
            output.Write(lengthBytes, 0, lengthBytes.Length);
            output.Write(payload, 0, payload.Length);
            output.Flush();
        }
    }
}
