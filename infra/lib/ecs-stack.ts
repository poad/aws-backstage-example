import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import assert from 'assert';

interface EcsStackProps extends cdk.StackProps {
    vpc: cdk.aws_ec2.IVpc;
    targetGroup: cdk.aws_elasticloadbalancingv2.IApplicationTargetGroup;
    dnsName: string;
    ecsSg: cdk.aws_ec2.ISecurityGroup;
    ecsApplicationPort: number;
    ecsHealthCheckConfig?: {
        port?: number;
        path?: string;
    };
    ecr: cdk.aws_ecr.Repository;
}

export class EcsStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: EcsStackProps) {
        super(scope, id, props);

        assert(props, '');
        const appName = this.node.tryGetContext('appName');
        assert(appName, '');
        const ecsConfig = this.node.tryGetContext('ecs');

        const {
            vpc,
            ecsSg,
            ecr,
            dnsName,
            targetGroup,
            ecsApplicationPort,
        } = props;

        const taskDefinition = new cdk.aws_ecs.TaskDefinition(this, 'TaskDefinition', {
            family: `${appName}-task-definition`,
            networkMode: cdk.aws_ecs.NetworkMode.AWS_VPC,
            compatibility: cdk.aws_ecs.Compatibility.EC2_AND_FARGATE,
            cpu: ecsConfig.cpu,
            memoryMiB: ecsConfig.memoryMiB,
        });

        const secret = new cdk.aws_secretsmanager.Secret(this, 'DatabaseSecret', {
            secretName: `${appName}-database-credentials`,
            generateSecretString: {
                secretStringTemplate: JSON.stringify({
                    username: 'postgres',
                }),
                generateStringKey: 'password',
                excludePunctuation: true,
                includeSpace: false,
            },
        });

        cdk.aws_rds.Credentials.fromSecret(secret, 'postgres');

        taskDefinition.addContainer('Container', {
            containerName: appName,
            image: cdk.aws_ecs.ContainerImage.fromEcrRepository(ecr),
            environment: {
                BASE_URL: dnsName,
            },
            secrets: {
                POSTGRES_HOST: cdk.aws_ecs.Secret.fromSecretsManager(secret, 'host'),
                POSTGRES_PORT: cdk.aws_ecs.Secret.fromSecretsManager(secret, 'port'),
                POSTGRES_USER: cdk.aws_ecs.Secret.fromSecretsManager(secret, 'username'),
                POSTGRES_PASSWORD: cdk.aws_ecs.Secret.fromSecretsManager(secret, 'password'),
            }
        });

        const cluster = new cdk.aws_ecs.Cluster(this, 'Cluster', {
            clusterName: `${appName}`,
            vpc,
        });

        const service = new cdk.aws_ecs.FargateService(this, 'Service', {
            taskDefinition,
            vpcSubnets: {
                subnetType: cdk.aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
            },
            securityGroups: [
                ecsSg
            ],
            cluster,
        });
        targetGroup.addTarget(service);
    }
}
